import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Intent =
  | "casual"
  | "transactions"
  | "leads"
  | "retention"
  | "stock"
  | "products"
  | "channels"
  | "sales"
  | "affiliates"
  | "warranty"
  | "strategy"
  | "overview";

// IMPORTANT: halaman /transactions memfilter tanggal dengan
// `${YYYY-MM-DD}T00:00:00.000Z` s/d `${YYYY-MM-DD}T23:59:59.999Z`.
// Dorizz AI harus memakai definisi hari yang PERSIS sama agar angka selalu cocok.
function adminTransactionDayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const dateKey = `${read("year")}-${read("month")}-${read("day")}`;
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);

  return { start, end, dateKey };
}

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function changeLabel(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return "tetap 0";
    return `naik dari 0 menjadi ${current}`;
  }
  const percent = ((current - previous) / previous) * 100;
  const direction = percent >= 0 ? "naik" : "turun";
  return `${direction} ${Math.abs(percent).toFixed(1)}%`;
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function detectIntent(messages: ChatMessage[]): Intent {
  const latest = messages[messages.length - 1]?.content.toLowerCase() || "";
  const recentUsers = messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content.toLowerCase())
    .join(" ");

  if (
    includesAny(latest, [
      "kamu lagi ngapain",
      "lagi ngapain",
      "siapa kamu",
      "kamu siapa",
      "halo",
      "hai",
      "hello",
      "makasih",
      "terima kasih",
    ])
  ) {
    return "casual";
  }

  if (includesAny(latest, ["expired", "expire", "berakhir", "renewal", "perpanjang", "retensi", "retention", "churn"])) return "retention";
  if (includesAny(latest, ["stok", "stock", "restok", "slot"])) return "stock";
  if (includesAny(latest, ["lead", "pelanggan baru", "customer baru", "user baru"])) return "leads";
  if (includesAny(latest, ["warranty", "garansi", "klaim"])) return "warranty";
  if (includesAny(latest, ["affiliate", "afiliasi", "referral", "komisi"])) return "affiliates";
  if (includesAny(latest, ["sales", "closer", "closing", "tim jual"])) return "sales";
  if (includesAny(latest, ["channel", "kanal", "sumber", "source"])) return "channels";
  if (includesAny(latest, ["produk", "terlaris", "best seller", "bestseller"])) return "products";

  if (
    includesAny(latest, [
      "transaksi",
      "order",
      "orderan",
      "omzet",
      "revenue",
      "penjualan",
      "sukses",
      "success",
      "pending",
      "gagal",
      "failed",
      "berhasil",
    ])
  ) {
    return "transactions";
  }

  if (includesAny(latest, ["analisis", "keputusan", "saran", "rekomendasi", "prioritas", "strategi", "kenapa", "mengapa"])) return "strategy";

  // Follow-up pendek seperti "yang sukses berapa" / "kalau pending?"
  if (includesAny(recentUsers, ["transaksi", "order", "omzet", "sukses", "success", "pending", "gagal", "failed"])) return "transactions";
  if (includesAny(recentUsers, ["expired", "berakhir", "retensi", "renewal"])) return "retention";
  if (includesAny(recentUsers, ["stok", "restok"])) return "stock";
  if (includesAny(recentUsers, ["lead", "pelanggan baru"])) return "leads";

  return "overview";
}

function casualAnswer(question: string) {
  const q = question.toLowerCase();
  if (includesAny(q, ["kamu lagi ngapain", "lagi ngapain"])) {
    return "Saya sedang siap membaca data Dorizz Store dan membantu kamu mengambil keputusan. Tanya saja transaksi, omzet, lead, stok, expired, sales, affiliate, atau performa bisnis.";
  }
  if (includesAny(q, ["siapa kamu", "kamu siapa"])) {
    return "Saya Dorizz AI, copilot bisnis internal Dorizz Store. Saya membaca data bisnis secara read-only dan membantu menjawab pertanyaan atau memberi rekomendasi.";
  }
  if (includesAny(q, ["makasih", "terima kasih"])) return "Siap. Kalau ada angka atau keputusan bisnis yang mau dicek, langsung tanya saja.";
  return "Halo. Saya siap bantu cek data dan keputusan bisnis Dorizz Store.";
}

function needsOpenAI(question: string, intent: Intent) {
  if (intent === "strategy") return true;
  const q = question.toLowerCase();
  return includesAny(q, [
    "analisis",
    "analisa",
    "kenapa",
    "mengapa",
    "saran",
    "rekomendasi",
    "strategi",
    "keputusan",
    "apa yang harus",
    "menurut kamu",
  ]);
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
                purchaseDate: { gte: new Date(Date.now() - activeDays * DAY_MS) },
              },
            },
          },
        });
      }),
      prisma.transaction.findMany({
        include: { user: { select: { name: true, email: true, whatsapp: true } } },
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
        include: { user: { select: { name: true, whatsapp: true, followUpStatus: true } } },
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
    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((item: unknown) => {
            if (!item || typeof item !== "object") return false;
            const value = item as Record<string, unknown>;
            return (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
          })
          .map((item: ChatMessage) => ({
            role: item.role,
            content: item.content.trim().slice(0, 1200),
          }))
          .slice(-8)
      : [];

    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Pertanyaan belum diisi" }, { status: 400 });
    }

    const lastQuestion = messages[messages.length - 1].content;
    const intent = detectIntent(messages);

    if (intent === "casual") {
      return NextResponse.json({
        answer: casualAnswer(lastQuestion),
        generatedAt: new Date().toISOString(),
        mode: "local",
        model: null,
        intent,
      });
    }

    const { start, end, dateKey } = adminTransactionDayRange();
    const yesterdayStart = new Date(start.getTime() - DAY_MS);
    const start7d = new Date(start.getTime() - 6 * DAY_MS);
    const start30d = new Date(start.getTime() - 29 * DAY_MS);
    const next7dEnd = new Date(end.getTime() + 7 * DAY_MS);

    const [
      todaySuccess,
      yesterdaySuccess,
      weekSuccess,
      monthSuccess,
      todayStatuses,
      leadsToday,
      leads30d,
      totalUsers,
      activeUsers,
      warranty,
      warranty30d,
      expiredToday,
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
      prisma.transaction.groupBy({ by: ["status"], where: { purchaseDate: { gte: start, lt: end } }, _count: { _all: true } }),
      prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
      prisma.user.count({ where: { createdAt: { gte: start30d, lt: end } } }),
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionStatus: "active" } }),
      prisma.warrantyClaim.count({ where: { status: "pending" } }),
      prisma.warrantyClaim.count({ where: { createdAt: { gte: start30d, lt: end } } }),
      prisma.transaction.count({ where: { status: "success", warrantyExpiredAt: { gte: start, lt: end } } }),
      prisma.transaction.count({ where: { status: "success", warrantyExpiredAt: { gte: end, lt: next7dEnd } } }),
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

    const statusToday: Record<string, number> = {};
    for (const item of todayStatuses) statusToday[item.status || "unknown"] = item._count._all;

    const successToday = statusToday.success || 0;
    const pendingToday = statusToday.pending || 0;
    const failedToday = statusToday.failed || 0;
    const totalToday = Object.values(statusToday).reduce((sum, value) => sum + value, 0);
    const otherToday = Math.max(0, totalToday - successToday - pendingToday - failedToday);

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
      dataDate: dateKey,
      transactionDateDefinition: "Sama persis dengan filter tanggal halaman Transaksi admin: purchaseDate 00:00:00Z sampai sebelum 00:00:00Z hari berikutnya.",
      transactions: {
        totalToday,
        successToday,
        pendingToday,
        failedToday,
        otherToday,
        revenueSuccessToday: numeric(todaySuccess._sum.amount),
        statusBreakdownToday: statusToday,
        successYesterday: yesterdaySuccess._count._all,
        revenueSuccessYesterday: numeric(yesterdaySuccess._sum.amount),
        success7d: weekSuccess._count._all,
        revenueSuccess7d: numeric(weekSuccess._sum.amount),
        success30d: monthSuccess._count._all,
        revenueSuccess30d: numeric(monthSuccess._sum.amount),
      },
      leads: { today: leadsToday, last30d: leads30d, totalCustomers: totalUsers, activeCustomers: activeUsers },
      retention: { expiredToday, expiringNext7Days: expiring7d, expiredLast30Days: expired30d },
      operations: { pendingWarrantyClaims: warranty, warrantyClaims30d: warranty30d, messagesSent30d },
      stock: stockSummary,
      sales: { activeMembers: activeSales, assistedTransactions30d: salesPerformance30d._count._all, assistedRevenue30d: numeric(salesPerformance30d._sum.amount) },
      affiliates: {
        active: activeAffiliates,
        referredLeads30d,
        commissionEvents30d: affiliatePerformance30d._count._all,
        commissions30d: numeric(affiliatePerformance30d._sum.amount),
        attributedRevenue30d: numeric(affiliatePerformance30d._sum.transactionAmount),
      },
      channels30d: sources.map((item) => ({ source: item.source || "unknown", transactions: item._count._all, revenue: numeric(item._sum.amount) })),
      topProducts30d: products.map((item) => ({ product: item.productName || "unknown", transactions: item._count._all, revenue: numeric(item._sum.amount) })),
    };

    const compactContext = (() => {
      switch (intent) {
        case "transactions":
          return { dataDate: context.dataDate, transactions: context.transactions };
        case "leads":
          return { dataDate: context.dataDate, leads: context.leads };
        case "retention":
          return { dataDate: context.dataDate, retention: context.retention };
        case "stock":
          return { stock: context.stock };
        case "products":
          return { topProducts30d: context.topProducts30d };
        case "channels":
          return { channels30d: context.channels30d };
        case "sales":
          return { sales: context.sales };
        case "affiliates":
          return { affiliates: context.affiliates };
        case "warranty":
          return { operations: { pendingWarrantyClaims: context.operations.pendingWarrantyClaims, warrantyClaims30d: context.operations.warrantyClaims30d } };
        case "strategy":
          return {
            dataDate: context.dataDate,
            transactions: context.transactions,
            leads: context.leads,
            retention: context.retention,
            stock: context.stock,
            operations: context.operations,
            sales: context.sales,
            affiliates: context.affiliates,
            channels30d: context.channels30d.slice(0, 5),
            topProducts30d: context.topProducts30d.slice(0, 5),
          };
        default:
          return {
            dataDate: context.dataDate,
            transactions: {
              totalToday: context.transactions.totalToday,
              successToday: context.transactions.successToday,
              pendingToday: context.transactions.pendingToday,
              failedToday: context.transactions.failedToday,
              revenueSuccessToday: context.transactions.revenueSuccessToday,
            },
            leads: { today: context.leads.today },
            retention: { expiredToday: context.retention.expiredToday, expiringNext7Days: context.retention.expiringNext7Days },
            stock: context.stock,
            operations: { pendingWarrantyClaims: context.operations.pendingWarrantyClaims },
          };
      }
    })();

    const txChange = changeLabel(context.transactions.successToday, context.transactions.successYesterday);
    const revenueChange = changeLabel(context.transactions.revenueSuccessToday, context.transactions.revenueSuccessYesterday);

    const buildFallbackAnswer = () => {
      const q = lastQuestion.toLowerCase();

      switch (intent) {
        case "transactions": {
          if (includesAny(q, ["pending"])) {
            return `Hari ini ada ${context.transactions.pendingToday} transaksi pending dari total ${context.transactions.totalToday} transaksi.`;
          }
          if (includesAny(q, ["gagal", "failed"])) {
            return `Hari ini ada ${context.transactions.failedToday} transaksi gagal dari total ${context.transactions.totalToday} transaksi.`;
          }
          if (includesAny(q, ["sukses", "success", "berhasil"])) {
            return `Hari ini ada ${context.transactions.successToday} transaksi sukses dari total ${context.transactions.totalToday} transaksi.`;
          }
          if (includesAny(q, ["omzet", "revenue"])) {
            return `Omzet transaksi sukses hari ini ${formatRupiah(context.transactions.revenueSuccessToday)} dari ${context.transactions.successToday} transaksi sukses.`;
          }
          return `Hari ini total ${context.transactions.totalToday} transaksi: ${context.transactions.successToday} sukses, ${context.transactions.pendingToday} pending, ${context.transactions.failedToday} gagal${context.transactions.otherToday ? `, dan ${context.transactions.otherToday} status lain` : ""}. Omzet dari transaksi sukses ${formatRupiah(context.transactions.revenueSuccessToday)}.`;
        }
        case "leads":
          return `Lead baru hari ini ${context.leads.today}. Dalam 30 hari terakhir ada ${context.leads.last30d} lead baru. Total pelanggan ${context.leads.totalCustomers}, dengan ${context.leads.activeCustomers} aktif.`;
        case "retention":
          return `Hari ini ada ${context.retention.expiredToday} langganan/transaksi sukses yang masa aktifnya berakhir. Dalam 7 hari berikutnya ada ${context.retention.expiringNext7Days} yang akan berakhir, dan dalam 30 hari terakhir ada ${context.retention.expiredLast30Days} yang sudah berakhir.`;
        case "stock": {
          const rows = Object.entries(context.stock).map(([type, item]) => `${type === "mobile" ? "HP" : type === "desktop" ? "PC" : type}: ${item.remainingSlots}/${item.totalSlots} slot tersisa`);
          return rows.length ? `Stok jual saat ini:\n- ${rows.join("\n- ")}` : "Belum ada stok jual yang terbaca dari database.";
        }
        case "products":
          return context.topProducts30d.length ? `Produk teratas 30 hari:\n${context.topProducts30d.slice(0, 5).map((item, i) => `${i + 1}. ${item.product}: ${item.transactions} transaksi, ${formatRupiah(item.revenue)}`).join("\n")}` : "Belum ada data produk sukses dalam 30 hari terakhir.";
        case "channels":
          return context.channels30d.length ? `Channel 30 hari:\n${[...context.channels30d].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((item, i) => `${i + 1}. ${item.source}: ${item.transactions} transaksi, ${formatRupiah(item.revenue)}`).join("\n")}` : "Belum ada data channel 30 hari terakhir.";
        case "sales":
          return `Sales aktif ${context.sales.activeMembers}. Dalam 30 hari, ${context.sales.assistedTransactions30d} transaksi teratribusi ke sales dengan omzet ${formatRupiah(context.sales.assistedRevenue30d)}.`;
        case "affiliates":
          return `Affiliate aktif ${context.affiliates.active}. Dalam 30 hari ada ${context.affiliates.referredLeads30d} lead referral, attributed revenue ${formatRupiah(context.affiliates.attributedRevenue30d)}, dan komisi ${formatRupiah(context.affiliates.commissions30d)}.`;
        case "warranty":
          return `Ada ${context.operations.pendingWarrantyClaims} klaim garansi pending. Dalam 30 hari terakhir tercatat ${context.operations.warrantyClaims30d} klaim.`;
        case "strategy":
          return `Snapshot ${context.dataDate}: total ${context.transactions.totalToday} transaksi (${context.transactions.successToday} sukses, ${context.transactions.pendingToday} pending, ${context.transactions.failedToday} gagal), omzet sukses ${formatRupiah(context.transactions.revenueSuccessToday)}, ${context.leads.today} lead baru, ${context.retention.expiredToday} expired hari ini, dan ${context.operations.pendingWarrantyClaims} klaim garansi pending.`;
        default:
          return `Hari ini total ${context.transactions.totalToday} transaksi: ${context.transactions.successToday} sukses, ${context.transactions.pendingToday} pending, ${context.transactions.failedToday} gagal. Omzet sukses ${formatRupiah(context.transactions.revenueSuccessToday)}, lead baru ${context.leads.today}, expired ${context.retention.expiredToday}.`;
      }
    };

    // Pertanyaan angka/fakta dijawab langsung dari DB agar 100% deterministik dan 0 token OpenAI.
    if (!needsOpenAI(lastQuestion, intent)) {
      return NextResponse.json({
        answer: buildFallbackAnswer(),
        generatedAt: context.generatedAt,
        mode: "business-engine",
        model: null,
        intent,
        dataDate: context.dataDate,
      });
    }

    const openAIKey = process.env.OPENAI_API_KEY?.trim();
    const openAIModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

    if (openAIKey) {
      try {
        const recentConversation = messages.slice(-6);
        const system = `Kamu adalah Dorizz AI, copilot bisnis internal Dorizz Store. Intent: ${intent}. Jawab Bahasa Indonesia secara langsung, cerdas, singkat, dan natural. DATA adalah satu-satunya sumber angka; jangan pernah menghitung angka lain dari asumsi. Untuk pertanyaan hari ini, gunakan field berakhiran Today. totalToday = semua transaksi yang tampil pada filter tanggal hari ini di halaman Transaksi. successToday/pendingToday/failedToday adalah subset dari totalToday. Rentang tanggal transaksi sama persis dengan halaman admin. Jika user meminta analisis, analisis hanya berdasarkan DATA. Sistem read-only. Maksimal sekitar 120 kata kecuali user meminta detail.\nDATA:${JSON.stringify(compactContext)}`;

        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: openAIModel,
            stream: false,
            temperature: 0.1,
            max_tokens: 320,
            messages: [{ role: "system", content: system }, ...recentConversation],
          }),
        });

        const raw = await aiResponse.text();
        let payload: any = null;
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch {
          console.error("Dorizz AI OpenAI non-JSON response:", aiResponse.status, raw.slice(0, 300));
        }

        if (aiResponse.ok) {
          const answer = payload?.choices?.[0]?.message?.content;
          if (typeof answer === "string" && answer.trim()) {
            return NextResponse.json({
              answer: answer.trim(),
              generatedAt: context.generatedAt,
              mode: "openai",
              model: openAIModel,
              intent,
              dataDate: context.dataDate,
              usage: payload?.usage
                ? {
                    promptTokens: payload.usage.prompt_tokens,
                    completionTokens: payload.usage.completion_tokens,
                    totalTokens: payload.usage.total_tokens,
                  }
                : undefined,
            });
          }
        } else {
          console.error("Dorizz AI OpenAI error:", aiResponse.status, payload?.error?.message || raw.slice(0, 300));
        }
      } catch (providerError) {
        console.error("Dorizz AI OpenAI fallback activated:", providerError);
      }
    }

    return NextResponse.json({
      answer: buildFallbackAnswer(),
      generatedAt: context.generatedAt,
      mode: "business-engine",
      model: openAIKey ? openAIModel : null,
      intent,
      dataDate: context.dataDate,
    });
  } catch (error) {
    console.error("POST /api/stats AI error:", error);
    return NextResponse.json({ error: "Gagal membaca data bisnis untuk Dorizz AI." }, { status: 500 });
  }
}
