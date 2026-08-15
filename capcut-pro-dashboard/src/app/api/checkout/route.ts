import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

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

    let affiliateId = null;
    if (affiliateCode) {
      const affiliate = await prisma.affiliate.findFirst({ where: { inviteToken: affiliateCode } });
      if (affiliate) {
        affiliateId = affiliate.id;
      }
    }

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

    // Cari atau buat User
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({
        where: { email },
        data: {
          name,
          whatsapp,
          ...(affiliateId && !user.referredBy ? { referredBy: affiliateId } : {})
        }
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name,
          whatsapp,
          customerType: "new",
          referredBy: affiliateId
        }
      });
    }

    // Handle Voucher
    let discount = 0;
    let finalAmount = Number(product.price);

    if (voucherCode) {
      const voucher = await prisma.voucher.findUnique({
        where: { code: voucherCode.toUpperCase() }
      });

      if (voucher && voucher.isActive) {
        // Simple validation again on server
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

          // Update usage count
          await prisma.voucher.update({
            where: { id: voucher.id },
            data: { currentUsage: { increment: 1 } }
          });
        }
      }
    }

    // Buat Transaksi
    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: finalAmount,
        productName: product.name,
        status: "pending",
        source: "website",
        voucherCode: voucherCode ? voucherCode.toUpperCase() : null,
        salesId: salesId,
      }
    });

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

      // Simpan data pembayaran ke database jika sukses
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
