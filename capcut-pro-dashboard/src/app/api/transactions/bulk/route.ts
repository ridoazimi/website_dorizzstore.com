import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { parseDuration, calcWarrantyExpiry } from "@/lib/duration";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 100;

type BulkRow = {
  name?: string;
  email?: string;
  whatsapp?: string;
  amount?: number | string;
  productName?: string;
  productId?: string;
  source?: string;
  activeDate?: string;
  durationDays?: number | string;
};

function cleanPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function purchaseDateFromKey(dateKey: string | undefined) {
  const safeKey = /^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")
    ? dateKey!
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

  // Pakai tengah hari UTC agar tanggal tidak bergeser ketika ditampilkan/filter per hari.
  return new Date(`${safeKey}T12:00:00.000Z`);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("page_transactions");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const rows: BulkRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "Data customer massal masih kosong." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Maksimal ${MAX_ROWS} baris per batch.` }, { status: 400 });
    }

    const uniqueProductIds = [...new Set(rows.map((row) => String(row.productId || "").trim()).filter(Boolean))];
    const products = uniqueProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: uniqueProductIds } },
          select: { id: true, name: true, duration: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const validRows: Array<{
      rowNumber: number;
      name: string;
      email: string;
      whatsapp: string;
      amount: number;
      productName: string;
      productId: string | null;
      source: string;
      purchaseDate: Date;
      durationDays: number;
      warrantyExpiredAt: Date;
    }> = [];
    const errors: Array<{ row: number; message: string }> = [];
    const seen = new Set<string>();

    rows.forEach((raw, index) => {
      const rowNumber = index + 1;
      const name = String(raw.name || "").trim();
      const email = String(raw.email || "").trim().toLowerCase();
      const whatsapp = cleanPhone(raw.whatsapp);
      const productId = String(raw.productId || "").trim() || null;
      const product = productId ? productMap.get(productId) : undefined;
      const productName = String(product?.name || raw.productName || "CapCut Pro").trim() || "CapCut Pro";
      const source = String(raw.source || "Manual").trim().toLowerCase() || "manual";
      const purchaseDate = purchaseDateFromKey(String(raw.activeDate || ""));
      const durationFromName = parseDuration(productName);
      const rawDuration = Number(product?.duration ?? raw.durationDays ?? 30);
      const durationDays = durationFromName > 0
        ? durationFromName
        : Math.max(1, Math.min(3650, Number.isFinite(rawDuration) ? Math.round(rawDuration) : 30));
      const amount = Math.max(0, parseAmount(raw.amount));

      if (!name) errors.push({ row: rowNumber, message: "Nama pelanggan wajib diisi." });
      if (!email || !EMAIL_RE.test(email)) errors.push({ row: rowNumber, message: "Email tidak valid." });
      if (!whatsapp) errors.push({ row: rowNumber, message: "Nomor WhatsApp wajib diisi." });
      if (productId && !product) errors.push({ row: rowNumber, message: "Produk terkait tidak ditemukan." });

      const dedupeKey = `${email}|${whatsapp}|${productName.toLowerCase()}|${purchaseDate.toISOString().slice(0, 10)}|${amount}`;
      if (seen.has(dedupeKey)) {
        errors.push({ row: rowNumber, message: "Baris duplikat di dalam batch yang sama." });
      }
      seen.add(dedupeKey);

      const hasError = errors.some((e) => e.row === rowNumber);
      if (hasError) return;

      validRows.push({
        rowNumber,
        name,
        email,
        whatsapp,
        amount,
        productName,
        productId,
        source,
        purchaseDate,
        durationDays,
        warrantyExpiredAt: calcWarrantyExpiry(purchaseDate, durationDays),
      });
    });

    if (!validRows.length) {
      return NextResponse.json({
        error: "Tidak ada baris valid untuk disimpan.",
        summary: { total: rows.length, created: 0, failed: errors.length, errors },
      }, { status: 400 });
    }

    let usersCreated = 0;
    let usersUpdated = 0;

    const createdTransactions = await prisma.$transaction(async (tx) => {
      const created: Array<{ id: string; userId: string | null; row: number }> = [];

      for (const row of validRows) {
        const existing = await tx.user.findUnique({
          where: { email: row.email },
          select: { id: true },
        });

        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                name: row.name,
                whatsapp: row.whatsapp,
                customerType: "returning",
                subscriptionStatus: "active",
                followUpStatus: "none",
              },
            })
          : await tx.user.create({
              data: {
                email: row.email,
                name: row.name,
                whatsapp: row.whatsapp,
                customerType: "new",
                subscriptionStatus: "active",
                followUpStatus: "none",
              },
            });

        if (existing) usersUpdated += 1;
        else usersCreated += 1;

        const transaction = await tx.transaction.create({
          data: {
            userId: user.id,
            productId: row.productId,
            stockAccountId: null,
            amount: row.amount,
            productName: row.productName,
            status: "success",
            source: row.source,
            purchaseDate: row.purchaseDate,
            warrantyExpiredAt: row.warrantyExpiredAt,
            createdAt: new Date(),
          },
          select: { id: true, userId: true },
        });

        created.push({ id: transaction.id, userId: transaction.userId, row: row.rowNumber });
      }

      return created;
    }, { maxWait: 10_000, timeout: 50_000 });

    return NextResponse.json({
      success: true,
      message: `${createdTransactions.length} transaksi manual berhasil dibuat.`,
      summary: {
        total: rows.length,
        valid: validRows.length,
        created: createdTransactions.length,
        failed: errors.length,
        usersCreated,
        usersUpdated,
        errors: errors.slice(0, 50),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions/bulk error:", error);
    return NextResponse.json({ error: "Gagal menyimpan input massal. Tidak ada data dalam batch gagal yang disimpan." }, { status: 500 });
  }
}
