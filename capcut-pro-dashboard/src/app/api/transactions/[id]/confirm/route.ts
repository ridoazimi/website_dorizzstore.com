import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { parseDuration, calcWarrantyExpiry } from "@/lib/duration";
import { parseProductType } from "@/lib/product";
import { notifyRestockIfNeeded } from "@/lib/restock-alert";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("page_transactions");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    if (transaction.status === "success") {
      return NextResponse.json({ error: "Transaksi sudah sukses" }, { status: 400 });
    }

    const user = transaction.user;
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 400 });
    }

    const productTitle = transaction.productName || "CapCut Pro";
    const productData = await prisma.product.findFirst({
      where: { name: productTitle }
    });

    const durationDays = productData?.duration || parseDuration(productTitle) || 30;

    const txResult = await prisma.$transaction(async (tx) => {
      let account = null;

      // Ambil data stock berdasarkan relasi product (bukan product_type)
      let candidateAccounts = await tx.stockAccount.findMany({
        where: {
          status: "available",
          usageType: "sale",
          product: {
            name: { contains: productTitle, mode: "insensitive" }
          }
        },
        orderBy: [{ usedSlots: "asc" }, { createdAt: "asc" }],
      });

      // Jika tidak ketemu by relation, coba by productId (jika ada)
      if (candidateAccounts.length === 0 && productData?.id) {
        candidateAccounts = await tx.stockAccount.findMany({
          where: {
            productId: productData.id,
            status: "available",
            usageType: "sale",
          },
          orderBy: [{ usedSlots: "asc" }, { createdAt: "asc" }],
        });
      }

      // Pilih akun yang masih ada sisa slot berdasarkan kolom max_slots di tabel stock
      account = candidateAccounts.find(acc =>
        (acc.usedSlots ?? 0) < (acc.maxSlots ?? 3)
      ) ?? null;

      if (!account) {
        throw new Error("STOK_KOSONG");
      }

      const purchaseDate = new Date();
      const warrantyExpiredAt = calcWarrantyExpiry(purchaseDate, durationDays);

      const updatedTrx = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: "success",
          stockAccountId: account.id,
          purchaseDate,
          warrantyExpiredAt,
        },
      });

      const accountMaxSlots = account.maxSlots ?? 3;
      const newUsedSlots = (account.usedSlots ?? 0) + 1;

      const updatedAccount = await tx.stockAccount.updateMany({
        where: {
          id: account.id,
          usedSlots: { lt: accountMaxSlots }
        },
        data: {
          usedSlots: { increment: 1 },
          status: newUsedSlots >= accountMaxSlots ? "sold" : "available",
        },
      });

      if (updatedAccount.count === 0) {
        throw new Error("SLOT_PENUH_RETRY");
      }

      return { account, transaction: updatedTrx };
    });

    const { account } = txResult;

    await notifyRestockIfNeeded(account.productType).catch((error) => {
      console.error("[Manual Confirm] restock alert error:", error);
    });

    // HIT URL APPSHEET (Same as in payment-success webhook)
    try {
      let waNumber = user.whatsapp || "";
      waNumber = waNumber.replace(/[^0-9]/g, "");
      if (waNumber.startsWith("0")) waNumber = "62" + waNumber.slice(1);
      if (!waNumber.startsWith("62")) waNumber = "62" + waNumber;

      let chatTemplate = productData?.messageTemplate || "Halo [nama],\n\nTerima kasih telah berlangganan [product] di Dorizz Store.\n\nDetail Akun:\nEmail: [email]\nPassword: [password]\n\nHarap simpan data ini dengan baik.";

      const processedMessage = chatTemplate
        .replace(/\[nama\]/g, user.name)
        .replace(/\[id_trx\]/g, transaction.id)
        .replace(/\[product\]/g, productTitle)
        .replace(/\[email\]/g, account.accountEmail)
        .replace(/\[password\]/g, account.accountPassword)
        .replace(/\[whatsapp\]/g, waNumber);

      await fetch("https://dorizz-n8n.7mewuf.easypanel.host/webhook/bf7fc32f-47cd-43c8-9b62-626948d502b7", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "nama user": user.name,
          "email user": user.email,
          "whatsapp user": waNumber,
          "akun capcut user": account.accountEmail,
          "passowrd capcut user": account.accountPassword,
          "pesan": processedMessage
        })
      });
    } catch (appsheetErr) {
      console.error("[Manual Confirm AppSheet] Gagal hit URL:", appsheetErr);
    }

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil dikonfirmasi secara manual",
      account: account.accountEmail
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "STOK_KOSONG") {
      return NextResponse.json({ error: "Gagal konfirmasi: Stok akun CapCut kosong atau habis. Silakan tambahkan akun baru di menu Stok terlebih dahulu." }, { status: 400 });
    }
    if (msg === "SLOT_PENUH_RETRY") {
      return NextResponse.json({ error: "Gagal konfirmasi: Akun CapCut terpilih baru saja penuh karena transaksi bersamaan. Silakan coba lagi." }, { status: 409 });
    }
    console.error("[Manual Confirm] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
