import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { parseDuration, calcWarrantyExpiry } from "@/lib/duration";
import { parseProductType } from "@/lib/product";
import { creditReferralReward } from "@/lib/loyalty-points";

/**
 * Webhook baru untuk memproses pembayaran lunas
 * Menerima callback dari payment gateway (KlikQRIS/Lainnya)
 * 
 * Flow:
 * 1. Update status transaksi jadi success
 * 2. Ambil akun dari stok (sharing/slot)
 * 3. Update slot akun
 * 4. Kirim WhatsApp via Barantum API
 * 5. Kirim Email via Nodemailer
 */

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log("[Webhook Payment Success] Received:", JSON.stringify(payload, null, 2));

    const transactionId = payload.order_id || payload.transaction_id;
    const status = payload.status; 
    
    if (!transactionId) {
      console.error("[Webhook Payment Success] Missing order_id in payload:", payload);
      return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
    }

    // Ambil data transaksi
    // Cek apakah transactionId adalah UUID valid untuk query ke DB
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId);
    
    let transaction = null;
    if (isUuid) {
      transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { user: true }
      });
    }

    if (!transaction) {
      console.warn(`[Webhook Payment Success] Transaksi dengan ID ${transactionId} tidak ditemukan.`);
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    // ===== VALIDASI SIGNATURE DARI DATABASE =====
    // Membandingkan signature payload dengan signature di kolom paymentData pada tabel transaksi
    const receivedSignature = payload.signature;
    const dbPaymentData = transaction.paymentData as any;
    const expectedSignature = dbPaymentData?.signature;

    if (!expectedSignature || receivedSignature !== expectedSignature) {
      console.error("[Webhook Payment Success] Invalid Signature! Expected:", expectedSignature, "Received:", receivedSignature);
      // Catatan: Jika di sandbox signature sering berubah, mungkin perlu log saja atau bypass di env tertentu
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // Hanya proses jika status menunjukkan keberhasilan
    const isPaid = status === true || status === "PAID" || status === "SUCCESS" || payload.status_pembayaran === "LUNAS";
    if (!isPaid) {
      console.log(`[Webhook] Status pembayaran ${status} untuk trx ${transactionId}, diabaikan.`);
      return NextResponse.json({ message: "Status belum lunas, diabaikan." }, { status: 200 });
    }

    // Validasi nominal (opsional tapi disarankan)
    const payloadAmount = Number(payload.amount || payload.total_amount || 0);
    const trxAmount = Number(transaction.amount);
    if (payloadAmount > 0 && payloadAmount < trxAmount) {
      console.error(`[Webhook] Nominal tidak sesuai untuk ${transactionId}. Expected >= ${trxAmount}, got ${payloadAmount}`);
      return NextResponse.json({ error: "Nominal tidak sesuai" }, { status: 400 });
    }

    if (transaction.status === "success") {
      return NextResponse.json({ message: "Transaksi sudah diproses sebelumnya" }, { status: 200 });
    }

    if (!transaction.user) {
      return NextResponse.json({ error: "User tidak ditemukan dalam transaksi" }, { status: 400 });
    }

    const user = transaction.user;
    const productTitle = transaction.productName || "CapCut Pro";
    const productData = await prisma.product.findFirst({
      where: { name: productTitle }
    });

    const productType = parseProductType(productTitle);
    const durationDays = productData?.duration || parseDuration(productTitle) || 30;

    console.log(`[Webhook] Processing ${productTitle} for ${durationDays} days`);
    
    // ===== 1. PROSES TRANSAKSI & CARI STOK =====


    const txResult = await prisma.$transaction(async (tx) => {
      // 1. Ambil kandidat akun available (jika ada productId)
      let account = null;
      // 1. Ambil kandidat akun available berdasarkan relasi product (bukan product_type)
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

      // Gunakan tanggal pembayaran dari payload jika ada, jika tidak gunakan waktu sekarang
      const purchaseDate = payload.payment_date ? new Date(payload.payment_date) : new Date();
      const warrantyExpiredAt = calcWarrantyExpiry(purchaseDate, durationDays);

      // 2. Update Transaksi (Selalu Sukses jika sudah lunas, meski stok kosong/pre-order)
      const updatedTrx = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: "success",
          stockAccountId: account?.id || null,
          purchaseDate,
          warrantyExpiredAt,
        },
      });

      // 3. Jika ada akun, update slotnya
      if (account) {
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
          throw new Error("SLOT_PENUH_RETRY"); // Jarang terjadi karena sudah difilter
        }

      }

      const reward = await creditReferralReward(tx, {
        affiliateId: user.referredBy,
        userId: user.id,
        transactionId: updatedTrx.id,
      });

      return { account, transaction: updatedTrx, reward };
    });

    const { account } = txResult;

    // Jika stok kosong, buat log peringatan tapi tetap lanjut proses
    if (!account) {
      console.warn(`[Webhook] STOK KOSONG (Pre-order) untuk ${productTitle}. Trx: ${transactionId}`);
      await prisma.messageLog.create({
        data: {
          userId: user.id,
          whatsappNumber: user.whatsapp || "UNKNOWN",
          messageType: "preorder_notice",
          messageContent: `⚠️ Pesanan Pre-order! Stok ${productTitle} sedang kosong. Trx: ${transactionId}`,
          status: "pending",
        },
      });
    }

    // ===== 2. HIT URL APPSHEET =====
    try {
      // Pastikan format nomor WA 62...
      let waNumber = user.whatsapp || "";
      waNumber = waNumber.replace(/[^0-9]/g, "");
      if (waNumber.startsWith("0")) waNumber = "62" + waNumber.slice(1);
      if (!waNumber.startsWith("62")) waNumber = "62" + waNumber;

      // Ambil template chat dari product dan ganti placeholder
      let chatTemplate = productData?.messageTemplate || "Halo [nama],\n\nTerima kasih telah berlangganan [product] di Dorizz Store.\n\nDetail Akun:\nEmail: [email]\nPassword: [password]\n\nHarap simpan data ini dengan baik.";

      const processedMessage = chatTemplate
        .replace(/\[nama\]/g, user.name)
        .replace(/\[id_trx\]/g, transaction.id)
        .replace(/\[product\]/g, productTitle)
        .replace(/\[email\]/g, account?.accountEmail || "(Sedang diproses/Pre-order)")
        .replace(/\[password\]/g, account?.accountPassword || "(Sedang diproses/Pre-order)")
        .replace(/\[whatsapp\]/g, waNumber);

      await fetch("https://dorizz-n8n.7mewuf.easypanel.host/webhook/bf7fc32f-47cd-43c8-9b62-626948d502b7", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "nama user": user.name,
          "email user": user.email,
          "whatsapp user": waNumber,
          "akun capcut user": account?.accountEmail || "Pre-order",
          "passowrd capcut user": account?.accountPassword || "Pre-order",
          "pesan": processedMessage
        })
      });
      console.log(`[Webhook AppSheet] Berhasil hit untuk transaksi ${transactionId}`);
    } catch (appsheetErr) {
      console.error("[Webhook AppSheet] Gagal hit URL:", appsheetErr);
    }

    return NextResponse.json({
      success: true,
      message: account ? "Webhook processed successfully" : "Pre-order processed successfully",
      order_id: transactionId,
      account: account?.accountEmail || null
    });

  } catch (error) {
    console.error("[Webhook Payment Success] Error:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}
