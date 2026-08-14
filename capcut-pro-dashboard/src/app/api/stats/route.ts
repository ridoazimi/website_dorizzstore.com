import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth";
import { generateText } from "ai";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function wibRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const start = new Date(Date.UTC(read("year"), read("month") - 1, read("day"), -7));
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

// GET /api/stats - Statistik untuk halaman Dashboard Overview
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const [
      totalTransactions,
      totalUsers,
      availableStock,
      activeUsers,
      recentTransactions,
      expiringUsers,
      pendingWarrantyClaims,
    ] = await Promise.all([
      prisma.transaction.count(),
      prisma.user.count(),
      prisma.stockAccount.count({ where: { status: "available" } }),

      prisma.appSetting.findUnique({ where: { key: "customer_active_days" } }).then(async (setting) => {
        const activeDays = Math.max(1, parseInt(setting?.value || "60") || 60);
        return prisma.user.count({
          where: {
            transactions: {
              some: {
                status: "success",
                purchaseDate: {
                  gte: new Date(Date.now() - activeDays * DAY_MS),
                },
              },
            },
          },
        });
      }),

      prisma.transaction.findMany({
        include: {
          user: { select: { name: true, email: true, whatsapp: true } },
        },
        orderBy: { purchaseDate: "desc" },
        take: 5,
      }),

      prisma.transaction.findMany({
        where: {
          warrantyExpiredAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 7 * DAY_MS),
          },
          status: "success",
        },
        include: {
          user: { select: { name: true, whatsapp: true, followUpStatus: true } },
        },
        orderBy: { warrantyExpiredAt: "asc" },
        take: 20,
      }),

      prisma.warrantyClaim.count({ where: { status: "pending" } }),
    ]);

    return NextResponse.json({
      totalTransactions,
      totalUsers,
      availableStock,
      activeUsers,
      recentTransactions,
      expiringUsers,
      pendingWarrantyClaims,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Gagal mengambil statistik" }, { status: 500 });
  }
}

// POST /api/stats - Dorizz AI Business Copilot (read-only)
export async function POST(req: NextRequest) {
  const auth = await requirePermission("page_ai");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages)
      ? body.messages
          .filter((item: unknown) => {
            if (!item || typeof item !== "object") return false;
            const value = item as Record<string, unknown>;
            return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
          })
          .map((item: { role: "user" | "assistant"; content: string }) => ({
            role: item.role,
            content: item.content.trim().slice(0, 4000),
          }))
          .slice(-12)
      : [];

    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Pertanyaan belum diisi" }, { status: 400 });
    }

    const { start, end } = wibRange();
    const yesterdayStart = new Date(start.getTime() - DAY_MS);
    const start7d = new Date(start.getTime() - 6 * DAY_MS);
    const start30d = new Date(start.getTime() - 29 * DAY_MS);
    const next7d = new Date(end.getTime() + 6 * DAY_MS);

    const [
      today,
      yesterday,
      week,
      month,
      leadsToday,
      leads30d,
      totalUsers,
      activeUsers,
      pending,
      warranty,
      warranty30d,
      expiring7d,
      expired30d,
      stock,
      sources,
      products,
      activeSales,
      salesPerformance30d,
      activeAffiliates,
      affiliatePerformance30d,
      referredLeads30d,
      messagesSent30d,
    ] = await Promise.all([
      prisma.transaction.aggregate({ where: { status: "success", purchaseDate: { gte: start, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { status: "success", purchaseDate: { gte: yesterdayStart, lt: start } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { status: "success", purchaseDate: { gte: start7d, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { status: "success", purchaseDate: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
      prisma.user.count({ where: { createdAt: { gte: start30d, lt: end } } }),
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionStatus: "active" } }),
      prisma.transaction.count({ where: { status: "pending" } }),
      prisma.warrantyClaim.count({ where: { status: "pending" } }),
      prisma.warrantyClaim.count({ where: { createdAt: { gte: start30d, lt: end } } }),
      prisma.transaction.count({ where: { status: "success", warrantyExpiredAt: { gte: start, lt: next7d } } }),
      prisma.transaction.count({ where: { status: "success", warrantyExpiredAt: { gte: start30d, lt: start } } }),
      prisma.stockAccount.findMany({ where: { usageType: "sale" }, select: { productType: true, usedSlots: true, maxSlots: true } }),
      prisma.transaction.groupBy({ by: ["source"], where: { status: "success", purchaseDate: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.transaction.groupBy({ by: ["productName"], where: { status: "success", purchaseDate: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true }, orderBy: { _count: { productName: "desc" } }, take: 8 }),
      prisma.salesTeam.count({ where: { status: "active" } }),
      prisma.transaction.aggregate({ where: { status: "success", salesId: { not: null }, purchaseDate: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.affiliate.count({ where: { status: "active" } }),
      prisma.affiliateCommission.aggregate({ where: { createdAt: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true, transactionAmount: true } }),
      prisma.user.count({ where: { referredBy: { not: null }, createdAt: { gte: start30d, lt: end } } }),
      prisma.messageLog.count({ where: { status: "sent", sentAt: { gte: start30d, lt: end } } }),
    ]);

    const stockSummary: Record<string, { accounts: number; remainingSlots: number; totalSlots: number }> = {};
    for (const item of stock) {
      const type = (item.productType || "unknown").toLowerCase();
      const maxSlots = item.maxSlots ?? (type === "desktop" ? 2 : 3);
      const current = stockSummary[type] || { accounts: 0, remainingSlots: 0, totalSlots: 0 };
      current.accounts += 1;
      current.remainingSlots += Math.max(0, maxSlots - (item.usedSlots ?? 0));
      current.totalSlots += maxSlots;
      stockSummary[type] = current;
    }

    const context = {
      generatedAt: new Date().toISOString(),
      timezone: "Asia/Jakarta",
      definitions: {
        newLead: "Lead baru dihitung dari pelanggan/user yang baru dibuat.",
        revenue: "Omzet dihitung dari transaksi berstatus success.",
        retention: "Data expiry menunjukkan jumlah transaksi berlangganan yang masa aktifnya berakhir pada periode tersebut; ini bukan otomatis churn unik per pelanggan.",
      },
      today: { transactions: today._count._all, revenue: numeric(today._sum.amount), newLeads: leadsToday },
      yesterday: { transactions: yesterday._count._all, revenue: numeric(yesterday._sum.amount) },
      last7Days: { transactions: week._count._all, revenue: numeric(week._sum.amount) },
      last30Days: { transactions: month._count._all, revenue: numeric(month._sum.amount), newLeads: leads30d },
      customers: {
        total: totalUsers,
        active: activeUsers,
        subscriptionsExpiringNext7Days: expiring7d,
        subscriptionsExpiredLast30Days: expired30d,
      },
      operations: {
        pendingTransactions: pending,
        pendingWarrantyClaims: warranty,
        warrantyClaimsLast30Days: warranty30d,
        messagesSentLast30Days: messagesSent30d,
      },
      stock: stockSummary,
      sales: {
        activeMembers: activeSales,
        assistedTransactionsLast30Days: salesPerformance30d._count._all,
        assistedRevenueLast30Days: numeric(salesPerformance30d._sum.amount),
      },
      affiliates: {
        activeAffiliates,
        referredLeadsLast30Days: referredLeads30d,
        commissionEventsLast30Days: affiliatePerformance30d._count._all,
        commissionsLast30Days: numeric(affiliatePerformance30d._sum.amount),
        attributedRevenueLast30Days: numeric(affiliatePerformance30d._sum.transactionAmount),
      },
      sourceBreakdown30d: sources.map((item) => ({
        source: item.source || "unknown",
        transactions: item._count._all,
        revenue: numeric(item._sum.amount),
      })),
      topProducts30d: products.map((item) => ({
        product: item.productName || "unknown",
        transactions: item._count._all,
        revenue: numeric(item._sum.amount),
      })),
    };

    const system = `Kamu adalah Dorizz AI, copilot bisnis internal Dorizz Store. Jawab dalam Bahasa Indonesia yang ringkas, tajam, dan berguna untuk keputusan. Gunakan hanya BUSINESS_CONTEXT untuk angka internal. Jangan mengarang angka. Semua waktu memakai WIB. Jika user menyebut lead baru, gunakan definisi newLead. Untuk rekomendasi, hubungkan transaksi, omzet, lead, stok, retention, sales, affiliate, warranty, dan channel bila relevan. Sistem ini read-only dan tidak boleh mengklaim mengubah data.\n\nBUSINESS_CONTEXT:\n${JSON.stringify(context)}`;

    const conversation = messages
      .map((message: { role: "user" | "assistant"; content: string }) =>
        `${message.role === "user" ? "USER" : "ASSISTANT"}: ${message.content}`
      )
      .join("\n\n");

    const { text } = await generateText({
      model: "openai/gpt-5.6-terra",
      system,
      prompt: `Berikut percakapan terbaru. Jawab pesan USER terakhir dengan mempertimbangkan konteks percakapan sebelumnya.\n\n${conversation}`,
    });

    if (!text?.trim()) {
      return NextResponse.json({ error: "AI tidak mengembalikan jawaban" }, { status: 502 });
    }

    return NextResponse.json({ answer: text.trim(), generatedAt: context.generatedAt });
  } catch (error) {
    console.error("POST /api/stats AI error:", error);
    return NextResponse.json({ error: "AI sedang tidak dapat merespons. Silakan coba lagi sebentar." }, { status: 502 });
  }
}
