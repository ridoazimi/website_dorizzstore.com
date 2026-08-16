import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { parseDuration, calcWarrantyExpiry } from "@/lib/duration";
import { parseProductType } from "@/lib/product";
import { creditReferralReward } from "@/lib/loyalty-points";

// FIX #6: Gunakan shared parseProductType dari lib/product.ts (hapus definisi lokal)

// POST /api/webhook/lynkid - Menerima webhook dari n8n (Lynk.id payment)
export async function POST(req: NextRequest) {
  try {
    // FIX #9: Validasi webhook secret (opsional, aktif jika env var di-set)
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

    // Validasi event
    if (event !== "payment.received" || messageAction !== "SUCCESS") {
      return NextResponse.json({
        success: false,
        message: `Event diabaikan: ${event} / ${messageAction}`,
      }, { status: 200 });
    }

    if (!messageData) {
      return NextResponse.json({ success: false, message: "Data pembayaran kosong" }, { status: 400 });
    }

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
    
    // Find matching product in DB
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { name: { contains: productTitle, mode: "insensitive" } },
          { slug: { contains: productTitle.toLowerCase().replace(/ /g, "-"), mode: "insensitive" } }
        ]
      }
    });
    const productId = product?.id || null;

    const questions = firstItem.questions || "";

    // Data affiliate dari payload Lynk.id
    const affiliateEmail = messageData.affiliate_email || null;

    // Cek duplikat refId
    if (refId) {
      const existing = await prisma.transaction.findUnique({ where: { lynkIdRef: refId } });
      if (existing) {
        return NextResponse.json({
          success: false,
          message: `Transaksi dengan refId ${refId} sudah ada`,
          transactionId: existing.id,
        }, { status: 200 });
      }
    }

    // ===== 1. AFFILIATE: Cari/buat affiliate =====
    let affiliateId: string | null = null;
    if (affiliateEmail) {
      let affiliate = await prisma.affiliate.findUnique({ where: { email: affiliateEmail } });
      if (!affiliate) {
        // Auto-create affiliate dari webhook
        affiliate = await prisma.affiliate.create({
          data: {
            name: affiliateEmail.split("@")[0],
            email: affiliateEmail,
            commissionRate: 10.00,
          },
        });
      }
      affiliateId = affiliate.id;
    }

    // ===== 2. Cari atau buat user =====
    let user = await prisma.user.findUnique({ where: { email: customer.email } });
    const isNewUser = !user;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: customer.email,
          name: customer.name,
          whatsapp: customer.phone || null,
          customerType: "new",
          subscriptionStatus: "active",
          followUpStatus: "none",
          referredBy: affiliateId, // Simpan relasi affiliate saat user pertama kali beli
        },
      });
    } else {
      // Update data user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: customer.name,
          whatsapp: customer.phone || user.whatsapp,
          customerType: user.customerType === "new" ? "returning" : user.customerType,
          subscriptionStatus: "active",
          followUpStatus: "none",
          // referredBy hanya diset saat pertama kali (jika belum ada)
          ...(affiliateId && !user.referredBy ? { referredBy: affiliateId } : {}),
        },
      });
    }

    // ===== 3. SHARING ACCOUNT: Cari stok yang masih ada slot kosong =====


    // FIX #1: Gunakan $transaction untuk atomic slot assignment
    const txResult = await prisma.$transaction(async (tx) => {
      // Cari kandidat akun berdasarkan relasi product (bukan product_type)
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

      // Fallback by productId jika tidak ketemu by name
      if (candidateAccounts.length === 0 && productId) {
        candidateAccounts = await tx.stockAccount.findMany({
          where: { 
            productId, 
            status: "available",
            usageType: "sale"
          },
          orderBy: [{ usedSlots: "asc" }, { createdAt: "asc" }],
        });
      }

      // Pilih akun yang masih ada sisa slot berdasarkan kolom max_slots di tabel stock
      const account = candidateAccounts.find(acc =>
        (acc.usedSlots ?? 0) < (acc.maxSlots ?? 3)
      ) ?? null;

      if (!account) return null;

      // ===== 4. Buat transaksi =====
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

      // ===== 5. FIX #1: Atomic update slot =====
      const accountMaxSlots = account.maxSlots ?? 3;
      const newUsedSlots = (account.usedSlots ?? 0) + 1;

      const updated = await tx.stockAccount.updateMany({
        where: {
          id: account.id,
          usedSlots: { lt: accountMaxSlots }, // Atomic guard
        },
        data: {
          usedSlots: { increment: 1 },
          status: newUsedSlots >= accountMaxSlots ? "sold" : "available",
        },
      });
      if (updated.count === 0) throw new Error("SLOT_PENUH"); // Rollback jika race condition

      const reward = await creditReferralReward(tx, {
        affiliateId: user.referredBy,
        userId: user.id,
        transactionId: transaction.id,
      });

      return { account, transaction, purchaseDate, warrantyExpiredAt, newUsedSlots, accountMaxSlots, reward };
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
      return NextResponse.json({
        success: false,
        message: "STOK HABIS! Tidak ada akun tersedia.",
        customer: { name: customer.name, email: customer.email, phone: customer.phone },
      }, { status: 200 });
    }

    // Destructure hasil dari $transaction
    const { account, transaction, newUsedSlots, accountMaxSlots } = txResult;

    // ===== 6. LOYALTY MEMBER REWARD =====
    const commissionInfo = txResult.reward.credited
      ? {
          points: txResult.reward.points,
          rupiah: txResult.reward.points * 1000,
          isNewCustomer: isNewUser,
        }
      : null;

    // ===== 7. Log pesan =====
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
      affiliate: commissionInfo,
      questions,
    }, { status: 200 });
  } catch (error) {
    console.error("Webhook Lynk.id error:", error);
    return NextResponse.json({ success: false, message: "Server error", error: String(error) }, { status: 500 });
  }
}

// GET /api/webhook/lynkid - Cek endpoint aktif
export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/webhook/lynkid",
    features: ["sharing_account", "affiliate_auto_commission", "slot_management"],
  });
}
