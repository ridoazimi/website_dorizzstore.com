import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { findExistingCustomer } from "@/lib/loyalty-referral";

export async function POST(req: Request) {
  try {
    const { productId, name, email, whatsapp, affiliateCode, voucherCode, salesCode } = await req.json();

    if (!productId || !name || !email || !whatsapp) {
      return NextResponse.json({ error: "Mohon lengkapi semua data" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    }

    const cookiesHeader = req.headers.get("cookie") || "";

    // Member referral berjalan paralel dengan Sales Creator.
    // /r/{code} menyimpan last-click selama 30 hari pada cookie HttpOnly.
    let resolvedMemberCode = affiliateCode;
    if (!resolvedMemberCode) {
      const memberMatch = cookiesHeader.match(/dorizz_referral=([^;]+)/);
      if (memberMatch) resolvedMemberCode = decodeURIComponent(memberMatch[1]);
    }

    let memberId: string | null = null;
    let memberReferralCode: string | null = null;
    if (resolvedMemberCode) {
      const members = await prisma.$queryRawUnsafe<Array<{ id: string; referral_code: string }>>(
        `SELECT id, referral_code FROM members WHERE referral_code=$1 AND status='active' LIMIT 1`,
        String(resolvedMemberCode).trim().toUpperCase()
      );
      if (members[0]) {
        memberId = members[0].id;
        memberReferralCode = members[0].referral_code;
      }
      // Referral invalid/expired tidak boleh memblokir checkout normal.
    }

    // ===== Sales Creator: dipertahankan persis sebagai flow existing =====
    let resolvedSalesCode = salesCode;
    if (!resolvedSalesCode) {
      const match = cookiesHeader.match(/sales_code=([^;]+)/);
      if (match) {
        resolvedSalesCode = decodeURIComponent(match[1]);
      }
    }

    let salesId = null;
    if (resolvedSalesCode) {
      const sales = await prisma.salesTeam.findFirst({
        where: {
          code: resolvedSalesCode,
          status: "active"
        }
      });
      if (sales) {
        salesId = sales.id;
      }
    }

    // Cari atau buat User berdasarkan email dan nomor WhatsApp yang dinormalisasi.
    let user = await findExistingCustomer(prisma, email, whatsapp);
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name, whatsapp }
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: String(email).trim().toLowerCase(),
          name,
          whatsapp,
          customerType: "new"
        }
      });
    }

    // Handle Voucher
    let discount = 0;
    let finalAmount = Number(product.price);
    let appliedVoucherCode: string | null = null;

    if (voucherCode) {
      const code = String(voucherCode).toUpperCase();
      const voucher = await prisma.voucher.findUnique({ where: { code } });

      if (voucher && voucher.isActive) {
        const rewardRows = await prisma.$queryRawUnsafe<Array<{ reward_product_id: string | null }>>(
          `SELECT reward_product_id FROM vouchers WHERE id=$1::uuid LIMIT 1`, voucher.id
        );
        const restrictedProductId = rewardRows[0]?.reward_product_id;
        if (restrictedProductId && restrictedProductId !== productId) {
          return NextResponse.json({ error: "Voucher reward hanya berlaku untuk produk reward yang sesuai" }, { status: 400 });
        }

        const isExpired = voucher.expiryDate && new Date() > new Date(voucher.expiryDate);
        const isFull = voucher.maxUsage !== null && (voucher.currentUsage || 0) >= voucher.maxUsage;
        const isMinPurchaseMet = finalAmount >= Number(voucher.minPurchase);

        if (!isExpired && !isFull && isMinPurchaseMet) {
          discount = voucher.type === "PERCENTAGE"
            ? (finalAmount * Number(voucher.value)) / 100
            : Number(voucher.value);
          finalAmount = Math.max(0, finalAmount - discount);
          appliedVoucherCode = code;
          await prisma.voucher.update({
            where: { id: voucher.id },
            data: { currentUsage: { increment: 1 } }
          });
        }
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: finalAmount,
        productName: product.name,
        status: "pending",
        source: "website",
        voucherCode: appliedVoucherCode,
        salesId
      }
    });

    if (memberId && memberReferralCode) {
      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET member_referral_id=$1::uuid, member_referral_code=$2, member_referral_attributed_at=now() WHERE id=$3::uuid`,
        memberId, memberReferralCode, transaction.id
      );
    }

    const klikQrisApiKey = process.env.KLIKQRIS_API_KEY;
    const klikQrisMerchantId = process.env.KLIKQRIS_MERCHANT_ID;

    if (!klikQrisApiKey || !klikQrisMerchantId) {
      console.warn("KLIKQRIS_API_KEY atau KLIKQRIS_MERCHANT_ID belum diatur di .env");
    }

    try {
      const qrisResponse = await fetch("https://klikqris.com/api/qris/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": klikQrisApiKey || "",
          "id_merchant": klikQrisMerchantId || ""
        },
        body: JSON.stringify({
          order_id: transaction.id,
          amount: Math.round(finalAmount),
          id_merchant: klikQrisMerchantId,
          keterangan: `Pembayaran ${product.name} - ${email}`
        })
      });

      const qrisData = await qrisResponse.json();
      if (qrisData?.status === true && qrisData.data) {
        try {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { paymentData: qrisData.data as any }
          });
        } catch (dbUpdateErr: any) {
          console.error("Gagal update paymentData di DB:", dbUpdateErr.message);
        }
      }

      return NextResponse.json({
        success: true,
        transactionId: transaction.id,
        productName: product.name,
        price: finalAmount,
        paymentData: qrisData?.status === true ? qrisData.data : null
      });
    } catch (error: any) {
      console.error("Checkout Final Error Catch:", error);
      return NextResponse.json({ error: "Terjadi kesalahan sistem", details: error.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Top Level Error Catch:", error);
    return NextResponse.json({ error: "Terjadi kesalahan sistem" }, { status: 500 });
  }
}
