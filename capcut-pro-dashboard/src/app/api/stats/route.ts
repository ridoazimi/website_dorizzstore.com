import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth";

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
          .map((item: { role: "user" | "assistant"; content: string }) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
          .slice(-12)
      : [];

    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Pertanyaan belum diisi" }, { status: 400 });
    }

    const { start, end } = wibRange();
    const yesterdayStart = new Date(start.getTime() - DAY_MS);
    const start7d = new Date(start.getTime() - 6 * DAY_MS);
    const start30d = new Date(start.getTime() - 29 * DAY_MS);

    const [today, yesterday, week, month, leadsToday, leads30d, totalUsers, activeUsers, pending, warranty, stock, sources, products] = await Promise.all([
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
      prisma.stockAccount.findMany({ where: { usageType: "sale" }, select: { productType: true, usedSlots: true, maxSlots: true } }),
      prisma.transaction.groupBy({ by: ["source"], where: { status: "success", purchaseDate: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.transaction.groupBy({ by: ["productName"], where: { status: "success", purchaseDate: { gte: start30d, lt: end } }, _count: { _all: true }, _sum: { amount: true }, orderBy: { _count: { productName: "desc" } }, take: 8 }),
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
      },
      today: { transactions: today._count._all, revenue: numeric(today._sum.amount), newLeads: leadsToday },
      yesterday: { transactions: yesterday._count._all, revenue: numeric(yesterday._sum.amount) },
      last7Days: { transactions: week._count._all, revenue: numeric(week._sum.amount) },
      last30Days: { transactions: month._count._all, revenue: numeric(month._sum.amount), newLeads: leads30d },
      customers: { total: totalUsers, active: activeUsers },
      operations: { pendingTransactions: pending, pendingWarrantyClaims: warranty },
      stock: stockSummary,
      sourceBreakdown30d: sources.map((item) => ({ source: item.source || "unknown", transactions: item._count._all, revenue: numeric(item._sum.amount) })),
      topProducts30d: products.map((item) => ({ product: item.productName || "unknown", transactions: item._count._all, revenue: numeric(item._sum.amount) })),
    };

    const oidcToken = req.headers.get("x-vercel-oidc-token");
    if (!oidcToken) {
      return NextResponse.json({ error: "AI Gateway OIDC belum tersedia pada deployment ini" }, { status: 503 });
    }

    const system = `Kamu adalah Dorizz AI, copilot bisnis internal Dorizz Store. Jawab dalam Bahasa Indonesia yang ringkas dan berguna untuk keputusan. Gunakan hanya BUSINESS_CONTEXT untuk angka internal. Jangan mengarang angka. Semua waktu memakai WIB. Jika user menyebut lead baru, gunakan definisi newLead. Berikan rekomendasi berdasarkan data bila diminta. Sistem ini read-only dan tidak boleh mengklaim mengubah data.\n\nBUSINESS_CONTEXT:\n${JSON.stringify(context)}`;

    const aiResponse = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4-mini",
        stream: false,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });

    const payload = await aiResponse.json().catch(() => null);
    if (!aiResponse.ok) {
      console.error("Dorizz AI gateway error:", aiResponse.status, payload);
      return NextResponse.json({ error: "AI sedang tidak dapat merespons" }, { status: 502 });
    }

    const answer = payload?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "AI tidak mengembalikan jawaban" }, { status: 502 });
    }

    return NextResponse.json({ answer: answer.trim(), generatedAt: context.generatedAt });
  } catch (error) {
    console.error("POST /api/stats AI error:", error);
    return NextResponse.json({ error: "Gagal memproses pertanyaan AI" }, { status: 500 });
  }
}
