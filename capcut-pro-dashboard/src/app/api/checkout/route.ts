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

    // Member referral berjalan paralel dengan Sales Creator.
    let memberId: string | null = null;
    let memberReferralCode: string | null = null;
    if (affiliateCode) {
      const members = await prisma.$queryRawUnsafe<Array<{ id: string; referral_code: string }>>(
        `SELECT id, referral_code FROM members WHERE referral_code=$1 AND status='active' LIMIT 1`,
        String(affiliateCode).trim().toUpperCase()
      );
      if (members[0]) {
        memberId = members[0].id;
        memberReferralCode = members[0].referral_code;
      }
      // Referral invalid tidak boleh memblokir checkout normal.
    }

    // ===== Sales Creator: dipertahankan persis sebagai flow existing =====
    let resolvedSalesCode = salesCode;
    if (!resolvedSalesCode) {
      const cookiesHeader = req.headers.get("cookie") || "";
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
        data: {
          name,
          whatsapp,
        }
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
      const normalizedVoucherCode = String(voucherCode).toUpperCase();
      const voucher = await prisma.voucher.findUnique({
        where: { code: normalizedVoucherCode }
      });

      if (voucher && voucher.isActive) {
        // Voucher reward Member hanya berlaku untuk produk yang ditentukan.
        const rewardVoucher = await prisma.$queryRawUnsafe<Array<{ reward_product_id: string | null }>>(
          `SELECT reward_product_id FROM vouchers WHERE id=$1::uuid LIMIT 1`, voucher.id
        );
        if (rewardVoucher[0]?.reward_product_id && rewardVoucher[0].reward_product_id !== productId) {
          return NextResponse.json({ error: "Voucher reward hanya berlaku untuk produk reward yang sesuai" }, { status: 400 });
        }

        const isExpired = voucher.expiryDate && new Date() > new Date(voucher.expiryDate);
        const isFull = voucher.maxUsage !== null && (voucher.currentUsage || 0) >= voucher.maxUsage;
        const isMinPurchaseMet = finalAmount >= Number(voucher.minPurchase);

        if (!isExpired && !isFull && isMinPurchaseMet) {
          if (voucher.type === "PERCENTAGE") {
            discount = (finalAmount * Number(voucher.value)) / 100;
          } else {
            discount = Number(voucher.value);
          }
          finalAmount = Math.max(0, finalAmount - discount);
          appliedVoucherCode = normalizedVoucherCode;

          await prisma.voucher.update({
            where: { id: voucher.id },
            data: { currentUsage: { increment: 1 } }
          });
        }
      }
    }

    // Buat Transaksi. salesId tetap disimpan seperti flow Sales Creator existing.
    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: finalAmount,
        productName: product.name,
        status: "pending",
        source: "website",
        voucherCode: appliedVoucherCode,
        salesId: salesId,
      }
    });

    // Attribution Member terpisah; tidak mengganti salesId.
    if (memberId && memberReferralCode) {
      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET member_referral_id=$1::uuid, member_referral_code=$2, member_referral_attributed_at=now() WHERE id=$3::uuid`,
        memberId, memberReferralCode, transaction.id
      );
    }

    // Panggil API KlikQRIS
    const klikQrisApiKey = process.env.KLIKQRIS_API_KEY;
    const klikQrisMerchantId = process.env.KLIKQRIS_MERCHANT_ID;

    if (!klikQrisApiKey || !klikQrisMerchantId) {
      console.warn("KLIKQRIS_API_KEY atau KLIKQRIS_MERCHANT_ID belum diatur di .env");
    }

    let qrisData: any = { status: false };
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

      qrisData = await qrisResponse.json();
      console.log("KlikQRIS Raw Response:", JSON.stringify(qrisData, null, 2));

      if (qrisData && qrisData.status === true && qrisData.data) {
        try {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              paymentData: qrisData.data as any
            }
          });
          console.log("Database update success for paymentData:", transaction.id);
        } catch (dbUpdateErr: any) {
          console.error("Gagal update paymentData di DB:", dbUpdateErr.message);
        }
      } else {
        console.error("KlikQRIS Response Status is FALSE or Data Missing:", qrisData);
      }

      return NextResponse.json({
        success: true,
        transactionId: transaction.id,
        productName: product.name,
        price: finalAmount,
        paymentData: (qrisData && qrisData.status === true) ? qrisData.data : null
      });

    } catch (error: any) {
      console.error("Checkout Final Error Catch:", error);
      return NextResponse.json({
        error: "Terjadi kesalahan sistem",
        details: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Top Level Error Catch:", error);
    return NextResponse.json({ error: "Terjadi kesalahan sistem" }, { status: 500 });
  }
}
