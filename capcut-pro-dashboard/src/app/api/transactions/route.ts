import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { parseDuration, calcWarrantyExpiry } from "@/lib/duration";
import { parseProductType } from "@/lib/product";

export const dynamic = 'force-dynamic';

// GET /api/transactions - Ambil semua transaksi
export async function GET(req: NextRequest) {
  const auth = await requirePermission("page_transactions");
  if ("error" in auth) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      const trimmedSearch = search.trim();
      const searchConditions: Record<string, unknown>[] = [
        { lynkIdRef: { contains: trimmedSearch, mode: "insensitive" } },
        { receiptNumber: { contains: trimmedSearch, mode: "insensitive" } },
        { user: { name: { contains: trimmedSearch, mode: "insensitive" } } },
        { user: { email: { contains: trimmedSearch, mode: "insensitive" } } },
        { user: { whatsapp: { contains: trimmedSearch, mode: "insensitive" } } },
      ];
      // Also search by transaction UUID (id)
      // Check if search is a valid full UUID format to prevent database query cast crashes
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(trimmedSearch)) {
        searchConditions.push({ id: trimmedSearch });
      }
      where.OR = searchConditions;
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const warrantyStart = searchParams.get("warrantyStart");
    const warrantyEnd = searchParams.get("warrantyEnd");
    const source = searchParams.get("source");

    // Filter tanggal transaksi (purchaseDate)
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate)   dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
      where.purchaseDate = dateFilter;
    }

    // Filter tanggal garansi berakhir (warrantyExpiredAt)
    if (warrantyStart || warrantyEnd) {
      const warrantyFilter: Record<string, Date> = {};
      if (warrantyStart) warrantyFilter.gte = new Date(`${warrantyStart}T00:00:00.000Z`);
      if (warrantyEnd)   warrantyFilter.lte = new Date(`${warrantyEnd}T23:59:59.999Z`);
      where.warrantyExpiredAt = warrantyFilter;
    }

    if (source && source !== "all" && source !== "Semua") {
      where.source = { equals: source, mode: "insensitive" };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, whatsapp: true } },
          stockAccount: { select: { id: true, accountEmail: true, status: true } },
          sales: { select: { id: true, name: true, code: true } },
        },
        orderBy: { purchaseDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({ transactions, total, page, limit });
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json({ error: "Gagal mengambil data transaksi" }, { status: 500 });
  }
}

// POST /api/transactions - Tambah transaksi manual
export async function POST(req: NextRequest) {
  const auth = await requirePermission("page_transactions");
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const { email, name, whatsapp, amount, productName, durationDays: rawDuration = 30, purchaseDate, source } = body;

    // Jika nama produk mengandung durasi (misal "1 bulan"), selalu pakai fix 30 hari
    // bukan durationDays dari stok yang bisa salah (mis. 31 hari di bulan Maret)
    const durationFromName = productName ? parseDuration(productName) : 0;
    const durationDays = durationFromName > 0 ? durationFromName : rawDuration;

    // FIX #4: Cari produk di database
    const matchedProduct = await prisma.product.findFirst({
      where: { name: productName || "" }
    });
    const detectedProductType = matchedProduct?.name || parseProductType(productName || "");

    if (!email || !name || !whatsapp) {
      return NextResponse.json({ error: "Email, nama, dan WhatsApp wajib diisi" }, { status: 400 });
    }

    // FIX #1: Wrap seluruh proses dalam prisma.$transaction (atomic)
    // Mencegah race condition: 2 request bersamaan tidak bisa ambil slot yang sama
    const result = await prisma.$transaction(async (tx) => {
      // 1. Cari atau buat user
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: { email, name, whatsapp },
        });
      } else {
        // Update user type ke returning
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            customerType: "returning",
            subscriptionStatus: "active",
            followUpStatus: "none",
            ...(whatsapp && { whatsapp }),
          },
        });
      }

      // 2. Hitung tanggal expired garansi (fix days, bukan calendar month)
      const baseDate = purchaseDate ? new Date(purchaseDate) : new Date();
      const warrantyExpiredAt = calcWarrantyExpiry(baseDate, durationDays);

      // 3. Buat transaksi (tanpa auto-assign akun stok, stockAccountId: null)
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          stockAccountId: null,
          amount: amount || 0,
          productName: productName || null,
          status: "success",
          source: source ? source.toLowerCase() : "manual",
          purchaseDate: baseDate,
          warrantyExpiredAt,
          createdAt: new Date(),
        },
        include: {
          user: true,
          stockAccount: true,
        },
      });

      // 4. Update status user menjadi active
      await tx.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "active", followUpStatus: "none" },
      });

      return { transaction };
    });

    return NextResponse.json({
      transaction: result.transaction,
      userId: result.transaction.userId,
      message: "Data transaksi berhasil ditambahkan, kirim data akun ke pelanggan?",
    }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Tangani error khusus dari dalam $transaction
    if (msg.startsWith("STOK_HABIS:")) {
      return NextResponse.json({ error: msg.replace("STOK_HABIS:", "") }, { status: 400 });
    }
    if (msg.startsWith("SLOT_PENUH:")) {
      return NextResponse.json({ error: msg.replace("SLOT_PENUH:", "") }, { status: 409 });
    }
    console.error("POST /api/transactions error:", error);
    return NextResponse.json({ error: "Gagal membuat transaksi" }, { status: 500 });
  }
}
