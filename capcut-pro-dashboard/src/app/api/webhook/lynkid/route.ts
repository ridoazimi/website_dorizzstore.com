import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { parseDuration, calcWarrantyExpiry } from "@/lib/duration";
import { parseProductType } from "@/lib/product";

// POST /api/webhook/lynkid - Menerima webhook dari n8n (Lynk.id payment)
export async function POST(req: NextRequest) {
  try {
    const webhookSecret = req.headers.get("x-webhook-secret");
    if (process.env.LYNKID_WEBHOOK_SECRET && webhookSecret !== process.env.LYNKID_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const data = Array.isArray(payload) ? payload[0] : payload;
    const body = data?.body || data;
    const event = body?.event;
    const messageData = body?.data?.message_data;
    const messageAction = body?.data?.message_action;

    if (event !== "payment.received" || messageAction !== "SUCCESS") {
      return NextResponse.json({ success: false, message: `Event diabaikan: ${event} / ${messageAction}` }, { status: 200 });
    }
    if (!messageData) return NextResponse.json({ success: false, message: "Data pembayaran kosong" }, { status: 400 });

    const customer = messageData.customer;
    if (!customer?.email || !customer?.name) {
      return NextResponse.json({ success: false, message: "Data customer tidak lengkap" }, { status: 400 });
    }

    const refId = messageData.refId;
    const items = messageData.items || [];
    const firstItem = items[0] || {};
    const productTitle = firstItem.title || "CapCut Pro";
    const price = messageData.totals?.grandTotal || firstItem.price || 0;
    const durationDays = parseDuration(productTitle);
    const productType = parseProductType(productTitle);
    const questions = firstItem.questions || "";

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { name: { contains: productTitle, mode: "insensitive" } },
          { slug: { contains: productTitle.toLowerCase().replace(/ /g, "-"), mode: "insensitive" } },
        ],
      },
    });
    const productId = product?.id || null;

    if (refId) {
      const existing = await prisma.transaction.findUnique({ where: { lynkIdRef: refId } });
      if (existing) {
        return NextResponse.json({ success: false, message: `Transaksi dengan refId ${refId} sudah ada`, transactionId: existing.id }, { status: 200 });
      }
    }

    // Affiliate lama sudah dihentikan. Lynk.id tetap membuat/update customer normal,
    // tanpa membuat Affiliate baru atau mengisi referredBy legacy.
    let user = await prisma.user.findUnique({ where: { email: customer.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: customer.email,
          name: customer.name,
          whatsapp: customer.phone || null,
          customerType: "new",
          subscriptionStatus: "active",
          followUpStatus: "none",
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: customer.name,
          whatsapp: customer.phone || user.whatsapp,
          customerType: user.customerType === "new" ? "returning" : user.customerType,
          subscriptionStatus: "active",
          followUpStatus: "none",
        },
      });
    }

    const txResult = await prisma.$transaction(async tx => {
      let candidateAccounts = await tx.stockAccount.findMany({
        where: {
          status: "available",
          usageType: "sale",
          product: { name: { contains: productTitle, mode: "insensitive" } },
        },
        orderBy: [{ usedSlots: "asc" }, { createdAt: "asc" }],
      });

      if (candidateAccounts.length === 0 && productId) {
        candidateAccounts = await tx.stockAccount.findMany({
          where: { productId, status: "available", usageType: "sale" },
          orderBy: [{ usedSlots: "asc" }, { createdAt: "asc" }],
        });
      }

      const account = candidateAccounts.find(acc => (acc.usedSlots ?? 0) < (acc.maxSlots ?? 3)) ?? null;
      if (!account) return null;

      const purchaseDate = messageData.createdAt ? new Date(messageData.createdAt) : new Date();
      const warrantyExpiredAt = calcWarrantyExpiry(purchaseDate, durationDays);
      const transaction = await tx.transaction.create({
        data: {
          lynkIdRef: refId || null,
          userId: user.id,
          stockAccountId: account.id,
          amount: price,
          productName: productTitle,
          status: "success",
          source: "lynkid",
          purchaseDate,
          warrantyExpiredAt,
        },
      });

      const accountMaxSlots = account.maxSlots ?? 3;
      const newUsedSlots = (account.usedSlots ?? 0) + 1;
      const updated = await tx.stockAccount.updateMany({
        where: { id: account.id, usedSlots: { lt: accountMaxSlots } },
        data: { usedSlots: { increment: 1 }, status: newUsedSlots >= accountMaxSlots ? "sold" : "available" },
      });
      if (updated.count === 0) throw new Error("SLOT_PENUH");

      return { account, transaction, purchaseDate, warrantyExpiredAt, newUsedSlots, accountMaxSlots };
    });

    if (!txResult) {
      await prisma.messageLog.create({
        data: {
          userId: user.id,
          whatsappNumber: customer.phone || "UNKNOWN",
          messageType: "stock_empty_alert",
          messageContent: `⚠️ STOK HABIS! Order: ${customer.name} (${customer.email}), produk: ${productTitle}. RefId: ${refId}`,
          status: "failed",
        },
      });
      return NextResponse.json({ success: false, message: "STOK HABIS! Tidak ada akun tersedia.", customer: { name: customer.name, email: customer.email, phone: customer.phone } }, { status: 200 });
    }

    const { account, transaction, newUsedSlots, accountMaxSlots } = txResult;
    await prisma.messageLog.create({
      data: {
        userId: user.id,
        transactionId: transaction.id,
        whatsappNumber: customer.phone || "UNKNOWN",
        messageType: "account_delivery",
        messageContent: `Akun CapCut Pro (${productType}) dikirim ke ${customer.name}. Email: ${account.accountEmail}. Slot: ${newUsedSlots}/${accountMaxSlots}.`,
        status: "sent",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil diproses!",
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      account: { email: account.accountEmail, password: account.accountPassword },
      transaction: {
        id: transaction.id,
        refId,
        amount: price,
        product: productTitle,
        productType,
        duration: durationDays,
        slot: `${newUsedSlots}/${accountMaxSlots}`,
        warrantyExpiredAt: txResult.warrantyExpiredAt.toISOString(),
      },
      questions,
    }, { status: 200 });
  } catch (error) {
    console.error("Webhook Lynk.id error:", error);
    return NextResponse.json({ success: false, message: "Server error", error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/webhook/lynkid",
    features: ["sharing_account", "slot_management"],
  });
}
