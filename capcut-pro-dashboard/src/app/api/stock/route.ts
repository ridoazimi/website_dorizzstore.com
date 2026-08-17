import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";

// GET /api/stock - Ambil semua stok akun dengan filter
export async function GET(req: NextRequest) {
  const auth = await requirePermission("page_stock");
  if ("error" in auth) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const productType = searchParams.get("productType") || "";
    const productId = searchParams.get("productId") || "";
    const usageType = searchParams.get("usageType") || ""; // sale | warranty
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "30");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { accountEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status && status !== "all" && status !== "Semua") where.status = status;
    if (productId && productId !== "all" && productId !== "Semua") {
      where.productId = productId;
    } else if (productType && productType !== "all" && productType !== "Semua") {
      where.product = { maxSlots: productType === "desktop" ? 2 : 3 };
    }
    if (usageType && usageType !== "all" && usageType !== "Semua") {
      where.usageType = usageType;
    }

    // ── Fetch semua data yang diperlukan ─────────────────────────────────────
    // ── Fetch paginated list ────────────────────────────────────────────────
    const [accounts, total] = await Promise.all([
      prisma.stockAccount.findMany({
        where,
        include: {
          transactions: {
            select: {
              user: { select: { name: true, email: true, whatsapp: true } },
              amount: true,
              productName: true,
              purchaseDate: true,
              warrantyExpiredAt: true,
              status: true,
            },
            orderBy: { purchaseDate: "desc" },
          },
          product: {
            select: { name: true, maxSlots: true }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stockAccount.count({ where }),
    ]);

    // ── Fetch all accounts for stats (Trigger reload) ───────────────────────
    const allAccounts = await prisma.stockAccount.findMany({
      select: {
        id: true,
        status: true,
        usedSlots: true,
        maxSlots: true,
        usageType: true,
        productType: true,
        product: { select: { maxSlots: true, name: true } }
      }
    });

    const mobileAccounts = allAccounts.filter(a => a.productType === "mobile");
    const desktopAccounts = allAccounts.filter(a => a.productType === "desktop");
    const saleAccounts = allAccounts.filter(a => a.usageType === "sale");
    const warrantyAccounts = allAccounts.filter(a => a.usageType === "warranty");

    // ── Helper: hitung status berdasarkan usedSlots vs maxSlots ──
    function effectiveStatus(acc: { status: string | null; usedSlots: number | null; maxSlots: number | null; product?: { maxSlots: number | null } | null }, defaultMax: number) {
      const used = acc.usedSlots ?? 0;
      const max = acc.maxSlots ?? acc.product?.maxSlots ?? defaultMax;
      if (used < max) return "available";
      return "sold";
    }

    // ── Auto-fix background ──────────────────────────────────────────────────
    const staleIds = allAccounts
      .filter(a => {
        const correctStatus = effectiveStatus(a, 3);
        return a.status !== correctStatus;
      })
      .map(a => a.id);

    if (staleIds.length > 0) {
      const shouldBeAvailable = allAccounts
        .filter(a => staleIds.includes(a.id) && effectiveStatus(a, 3) === "available")
        .map(a => a.id);
      const shouldBeSold = staleIds.filter(id => !shouldBeAvailable.includes(id));

      if (shouldBeAvailable.length > 0) {
        prisma.stockAccount.updateMany({
          where: { id: { in: shouldBeAvailable } },
          data: { status: "available" },
        }).catch(e => console.error("[stock] auto-fix to available error:", e));
      }
      if (shouldBeSold.length > 0) {
        prisma.stockAccount.updateMany({
          where: { id: { in: shouldBeSold } },
          data: { status: "sold" },
        }).catch(e => console.error("[stock] auto-fix to sold error:", e));
      }
    }

    // ── Hitung stats ─────────────────────────────────────────────────────────
    const mobileStatusCounts = { available: 0, sold: 0 };
    mobileAccounts.forEach(acc => {
      if (effectiveStatus(acc, 3) === "available") mobileStatusCounts.available++;
      else mobileStatusCounts.sold++;
    });

    const desktopStatusCounts = { available: 0, sold: 0 };
    desktopAccounts.forEach(acc => {
      if (effectiveStatus(acc, 2) === "available") desktopStatusCounts.available++;
      else desktopStatusCounts.sold++;
    });

    const saleStatusCounts = { available: 0, sold: 0 };
    saleAccounts.forEach(acc => {
      if (effectiveStatus(acc, 3) === "available") saleStatusCounts.available++;
      else saleStatusCounts.sold++;
    });

    const warrantyStatusCounts = { available: 0, sold: 0 };
    warrantyAccounts.forEach(acc => {
      if (effectiveStatus(acc, 3) === "available") warrantyStatusCounts.available++;
      else warrantyStatusCounts.sold++;
    });

    const statusCounts = {
      available: mobileStatusCounts.available + desktopStatusCounts.available,
      sold: mobileStatusCounts.sold + desktopStatusCounts.sold,
    };

    const remainingSlotsMobile = mobileAccounts
      .filter(acc => effectiveStatus(acc, 3) === "available")
      .reduce((sum, acc) => sum + Math.max(0, (acc.maxSlots ?? 3) - (acc.usedSlots ?? 0)), 0);

    const remainingSlotsDesktop = desktopAccounts
      .filter(acc => effectiveStatus(acc, 2) === "available")
      .reduce((sum, acc) => sum + Math.max(0, (acc.maxSlots ?? 2) - (acc.usedSlots ?? 0)), 0);

    const remainingSlotsSale = saleAccounts
      .filter(acc => effectiveStatus(acc, 3) === "available")
      .reduce((sum, acc) => sum + Math.max(0, (acc.maxSlots ?? 3) - (acc.usedSlots ?? 0)), 0);

    const remainingSlotsWarranty = warrantyAccounts
      .filter(acc => effectiveStatus(acc, 3) === "available")
      .reduce((sum, acc) => sum + Math.max(0, (acc.maxSlots ?? 3) - (acc.usedSlots ?? 0)), 0);

    return NextResponse.json({
      accounts, total, page, limit,
      statusCounts,
      mobileStatusCounts, mobileTotal: mobileAccounts.length,
      desktopStatusCounts, desktopTotal: desktopAccounts.length,
      saleStatusCounts, saleTotal: saleAccounts.length,
      warrantyStatusCounts, warrantyTotal: warrantyAccounts.length,
      remainingSlotsMobile, remainingSlotsDesktop,
      remainingSlotsSale, remainingSlotsWarranty,
    });
  } catch (error) {
    console.error("GET /api/stock error:", error);
    return NextResponse.json({ error: "Gagal mengambil stok akun" }, { status: 500 });
  }
}

// POST /api/stock - Tambah stok akun (single atau bulk) + tipe produk & slot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accounts, durationDays = 30, productId, maxSlots, usageType = "sale", productType = "mobile" } = body;

    // Get maxSlots from product if not provided
    let slots = maxSlots;
    if (!slots && productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      slots = product?.maxSlots || 3;
    }
    if (!slots) slots = 3;

    let data: { accountEmail: string; accountPassword: string; durationDays: number; productId: string | null; maxSlots: number; usedSlots: number; usageType: string; productType: string }[];

    if (Array.isArray(accounts)) {
      data = accounts.map((acc: { email: string; password: string }) => ({
        accountEmail: acc.email,
        accountPassword: acc.password,
        durationDays,
        productId: body.productId || null, // Tambahkan productId jika ada
        maxSlots: slots,
        usedSlots: 0,
        usageType: usageType,
        productType: productType,
      }));
    } else if (body.email && body.password) {
      data = [{
        accountEmail: body.email,
        accountPassword: body.password,
        durationDays,
        productId: body.productId || null,
        maxSlots: slots,
        usedSlots: 0,
        usageType: usageType,
        productType: productType,
      }];
    } else {
      return NextResponse.json({ error: "Data akun tidak valid" }, { status: 400 });
    }

    const result = await prisma.stockAccount.createMany({
      data: data as any
    });

    return NextResponse.json({ created: result.count }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/stock error:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Email akun sudah terdaftar di sistem." }, { status: 400 });
    }
    return NextResponse.json({ error: "Gagal menambahkan stok: " + (error.message || "Unknown error") }, { status: 500 });
  }
}
