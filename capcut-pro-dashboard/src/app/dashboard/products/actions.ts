"use server";
// Trigger rebuild for new prisma schema

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { uploadImage } from "@/lib/upload";
import {
  applyDurationToProductFields,
  syncProductDurationsFromAvailableStock,
} from "@/lib/product-duration";

export type ReorderProductItem = { id: string; sortOrder: number };

function isValidReorderItem(item: unknown): item is ReorderProductItem {
  if (!item || typeof item !== "object") return false;
  const { id, sortOrder } = item as Record<string, unknown>;
  return (
    typeof id === "string" &&
    id.trim().length > 0 &&
    sortOrder != null &&
    typeof sortOrder === "number" &&
    Number.isFinite(sortOrder)
  );
}

export async function getProducts(activeOnly: boolean = false, take?: number) {
  try {
    // The first catalog/admin read after midnight WIB refreshes product copy
    // from the remaining duration of available stock.
    await syncProductDurationsFromAvailableStock();

    // Order by sortOrder ascending to respect admin panel drag-and-drop order
    // Filter to only show active products when activeOnly is true
    const products = await prisma.product.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      ...(take ? { take } : {}),
      include: {
        _count: {
          select: {
            transactions: true,
          },
        },
        stockAccounts: {
          include: {
            _count: {
              select: {
                transactions: true,
              },
            },
          },
        },
      },
    });


    // Log fetched products for debugging
    console.log("Fetched products (raw):", products);

    // Fetch all available stock to calculate counts
    const stocks = await prisma.stockAccount.findMany({
      where: {
        status: "available",
      }
    });

    // Map stocks to products by relation
    return products.map((p: any) => {
      // Find matching stocks using productId relation
      const matchingStocks = stocks.filter(s => s.productId === p.id);

      // Calculate total available slots
      const availableStock = matchingStocks.reduce((acc, curr) => {
        const slots = (curr.maxSlots || 0) - (curr.usedSlots || 0);
        return acc + (slots > 0 ? slots : 0);
      }, 0);

      // Count sold transactions from direct relation or via stock accounts
      const directTransactionsCount = p._count?.transactions || 0;
      const stockAccountsTransactionsCount = (p.stockAccounts || []).reduce(
        (sum: number, sa: any) => sum + (sa._count?.transactions || 0),
        0
      );
      const soldCount = directTransactionsCount || stockAccountsTransactionsCount;

      return {
        ...p,
        price: Number(p.price),
        discountPercentage: p.discountPercentage ?? 0,
        availableStock,
        soldCount,
      };
    });
    } catch (error) {
      console.error("Error fetching products (final):", error);
      return [];
    }
}

export async function createProduct(formData: FormData) {
  const auth = await requirePermission("page_marketplace");
  if ("error" in auth) throw new Error("Forbidden: Akses ditolak");

  try {
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;
    const price = parseFloat(priceStr || "0");
    const discountPercentageStr = formData.get("discountPercentage") as string;
    const discountPercentage = parseInt(discountPercentageStr || "0", 10);
    const category = formData.get("category") as string;
    const maxSlotsStr = formData.get("maxSlots") as string;
    const maxSlots = parseInt(maxSlotsStr || "3");
    const durationStr = formData.get("duration") as string;
    const duration = parseInt(durationStr || "30");
    const isActive = formData.get("isActive") === "true";
    const rules = formData.get("rules") as string;
    const messageTemplate = formData.get("messageTemplate") as string;
    const imageFile = formData.get("imageFile") as File | null;
    let imageUrl = formData.get("imageUrl") as string || "";

    if (imageFile && imageFile.size > 0) {
      try {
        imageUrl = await uploadImage(imageFile, "products");
        console.log(`[Product Upload] Success: ${imageUrl}`);
      } catch (uploadErr) {
        console.error("[Product Upload] Failed:", uploadErr);
        throw new Error("Gagal mengunggah gambar produk.");
      }
    }

    const syncedFields = applyDurationToProductFields(
      { name, slug, category, description, rules, messageTemplate },
      duration,
    );

    // Get highest sortOrder to place new product at the end
    const maxOrder = await prisma.product.aggregate({
      _max: { sortOrder: true },
    });
    const nextSortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const product = await prisma.product.create({
      data: {
        name: syncedFields.name,
        slug: syncedFields.slug,
        description: syncedFields.description,
        price,
        discountPercentage: isNaN(discountPercentage) ? 0 : discountPercentage,
        category: syncedFields.category,
        maxSlots,
        duration: syncedFields.duration,
        imageUrl,
        isActive,
        stockStatus: formData.get("stockStatus") as string || "INTEGRATED",
        rules: syncedFields.rules,
        messageTemplate: syncedFields.messageTemplate,
        sortOrder: nextSortOrder,
      },
    });
    revalidatePath("/dashboard/products");
    revalidatePath("/");
    return product;
  } catch (error: any) {
    console.error("Error creating product:", error);
    throw new Error(error.message || "Gagal membuat produk");
  }
}

export async function updateProduct(id: string, formData: FormData) {
  const auth = await requirePermission("page_marketplace");
  if ("error" in auth) throw new Error("Forbidden: Akses ditolak");

  try {
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;
    const price = parseFloat(priceStr || "0");
    const discountPercentageStr = formData.get("discountPercentage") as string;
    const discountPercentage = parseInt(discountPercentageStr || "0", 10);
    const category = formData.get("category") as string;
    const maxSlotsStr = formData.get("maxSlots") as string;
    const maxSlots = parseInt(maxSlotsStr || "3");
    const durationStr = formData.get("duration") as string;
    const duration = parseInt(durationStr || "30");
    const isActive = formData.get("isActive") === "true";
    const rules = formData.get("rules") as string;
    const messageTemplate = formData.get("messageTemplate") as string;
    const imageFile = formData.get("imageFile") as File | null;
    let imageUrl = formData.get("imageUrl") as string || "";

    if (imageFile && imageFile.size > 0) {
      try {
        imageUrl = await uploadImage(imageFile, "products");
        console.log(`[Product Update Upload] Success: ${imageUrl}`);
      } catch (uploadErr) {
        console.error("[Product Update Upload] Failed:", uploadErr);
        throw new Error("Gagal mengunggah gambar produk baru.");
      }
    }

    const syncedFields = applyDurationToProductFields(
      { name, slug, category, description, rules, messageTemplate },
      duration,
    );

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: syncedFields.name,
        slug: syncedFields.slug,
        description: syncedFields.description,
        price,
        discountPercentage: isNaN(discountPercentage) ? 0 : discountPercentage,
        category: syncedFields.category,
        maxSlots,
        duration: syncedFields.duration,
        ...(imageUrl ? { imageUrl } : {}), // Only update if new image uploaded
        isActive,
        stockStatus: formData.get("stockStatus") as string || "INTEGRATED",
        rules: syncedFields.rules,
        messageTemplate: syncedFields.messageTemplate,
      },
    });
    revalidatePath("/dashboard/products");
    revalidatePath("/");
    return product;
  } catch (error: any) {
    console.error("Error updating product:", error);
    throw new Error(error.message || "Gagal mengupdate produk");
  }
}

export async function deleteProduct(id: string) {
  const auth = await requirePermission("page_marketplace");
  if ("error" in auth) throw new Error("Forbidden: Akses ditolak");
  try {
    await prisma.product.delete({
      where: { id },
    });
    revalidatePath("/dashboard/products");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
}

export async function reorderProducts(items: ReorderProductItem[]) {
  const auth = await requirePermission("page_marketplace");
  if ("error" in auth) throw new Error("Forbidden: Akses ditolak");

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Payload urutan produk kosong atau tidak valid");
  }

  const invalidIndex = items.findIndex((item) => !isValidReorderItem(item));
  if (invalidIndex !== -1) {
    throw new Error(
      `Payload urutan produk tidak valid pada index ${invalidIndex}: id dan sortOrder wajib diisi`
    );
  }

  try {
    await prisma.$transaction(
      items.map((item) =>
        prisma.product.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    revalidatePath("/dashboard/products");
    revalidatePath("/");
    return { success: true };
  } catch (error: unknown) {
    const prismaError = error as {
      code?: string;
      meta?: unknown;
      message?: string;
    };
    console.error("Error reordering products:", {
      code: prismaError.code,
      meta: prismaError.meta,
      message: prismaError.message,
    });
    throw new Error(prismaError.message || "Gagal mengubah urutan produk");
  }
}
