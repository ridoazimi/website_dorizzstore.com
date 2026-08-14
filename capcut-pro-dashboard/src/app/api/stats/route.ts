import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";
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

    const lastQuestion = messages[messages.length - 1].content;

    const buildFallbackAnswer = (question: string) => {
      const q = question.toLowerCase();
      const txChange = changeLabel(context.today.transactions, context.yesterday.transactions);
      const revenueChange = changeLabel(context.today.revenue, context.yesterday.revenue);
      const averageDailyLeads30d = context.last30Days.newLeads / 30;

      if (["transaksi", "order", "orderan", "omzet", "revenue", "penjualan"].some((word) => q.includes(word))) {
        return `Hari ini ada ${context.today.transactions} transaksi sukses dengan omzet ${formatRupiah(context.today.revenue)}. Kemarin ada ${context.yesterday.transactions} transaksi dengan omzet ${formatRupiah(context.yesterday.revenue)}. Dibanding kemarin, jumlah transaksi ${txChange} dan omzet ${revenueChange}. Dalam 7 hari terakhir tercatat ${context.last7Days.transactions} transaksi dengan omzet ${formatRupiah(context.last7Days.revenue)}.`;
      }

      if (["lead", "pelanggan baru", "customer baru", "user baru"].some((word) => q.includes(word))) {
        const pace = context.today.newLeads >= averageDailyLeads30d ? "di atas atau setara" : "di bawah";
        return `Lead/pelanggan baru hari ini: ${context.today.newLeads}. Dalam 30 hari terakhir ada ${context.last30Days.newLeads} lead baru, rata-rata ${averageDailyLeads30d.toFixed(1)} per hari. Pace hari ini ${pace} rata-rata 30 hari. Total pelanggan sekarang ${context.customers.total}, dengan ${context.customers.active} berstatus aktif.`;
      }

      if (["stok", "restok", "stock"].some((word) => q.includes(word))) {
        const entries = Object.entries(context.stock);
        if (!entries.length) return "Belum ada stok jual yang terbaca dari database.";
        const lines = entries.map(([type, item]) => {
          const label = type === "mobile" ? "HP" : type === "desktop" ? "PC" : type;
          return `${label}: ${item.remainingSlots} slot tersisa dari ${item.totalSlots} slot`;
        });
        const mobileLow = (context.stock.mobile?.remainingSlots ?? Number.POSITIVE_INFINITY) <= 2;
        const desktopLow = (context.stock.desktop?.remainingSlots ?? Number.POSITIVE_INFINITY) <= 1;
        const alerts = [mobileLow ? "HP sudah masuk batas restok" : "", desktopLow ? "PC sudah masuk batas restok" : ""].filter(Boolean);
        return `Kondisi stok jual saat ini:\n- ${lines.join("\n- ")}${alerts.length ? `\n\nPerhatian: ${alerts.join(" dan ")}.` : "\n\nBelum ada stok yang menyentuh batas restok utama."}`;
      }

      if (["produk", "terlaris", "best seller", "bestseller"].some((word) => q.includes(word))) {
        if (!context.topProducts30d.length) return "Belum ada data produk sukses dalam 30 hari terakhir.";
        const rows = context.topProducts30d.slice(0, 5).map((item, index) => `${index + 1}. ${item.product}: ${item.transactions} transaksi, ${formatRupiah(item.revenue)}`);
        return `Produk teratas 30 hari terakhir:\n${rows.join("\n")}`;
      }

      if (["sumber", "channel", "kanal", "source"].some((word) => q.includes(word))) {
        if (!context.sourceBreakdown30d.length) return "Belum ada data sumber transaksi sukses dalam 30 hari terakhir.";
        const ranked = [...context.sourceBreakdown30d].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
        return `Sumber penjualan 30 hari terakhir berdasarkan omzet:\n${ranked.map((item, index) => `${index + 1}. ${item.source}: ${item.transactions} transaksi, ${formatRupiah(item.revenue)}`).join("\n")}`;
      }

      if (["sales", "closing", "closer"].some((word) => q.includes(word))) {
        return `Tim sales aktif: ${context.sales.activeMembers}. Dalam 30 hari terakhir, transaksi yang teratribusi ke sales sebanyak ${context.sales.assistedTransactionsLast30Days} dengan omzet ${formatRupiah(context.sales.assistedRevenueLast30Days)}.`;
      }

      if (["affiliate", "afiliasi", "referral", "komisi"].some((word) => q.includes(word))) {
        return `Affiliate aktif: ${context.affiliates.activeAffiliates}. Dalam 30 hari terakhir ada ${context.affiliates.referredLeadsLast30Days} lead referral, ${context.affiliates.commissionEventsLast30Days} event komisi, attributed revenue ${formatRupiah(context.affiliates.attributedRevenueLast30Days)}, dan total komisi ${formatRupiah(context.affiliates.commissionsLast30Days)}.`;
      }

      if (["warranty", "garansi", "klaim"].some((word) => q.includes(word))) {
        return `Saat ini ada ${context.operations.pendingWarrantyClaims} klaim garansi pending. Dalam 30 hari terakhir tercatat ${context.operations.warrantyClaimsLast30Days} klaim garansi. Fokus operasional: selesaikan klaim pending lebih dulu agar SLA dan kepuasan pelanggan terjaga.`;
      }

      if (["retention", "retensi", "expired", "renewal", "perpanjang", "churn"].some((word) => q.includes(word))) {
        return `Ada ${context.customers.subscriptionsExpiringNext7Days} langganan yang akan berakhir dalam 7 hari ke depan dan ${context.customers.subscriptionsExpiredLast30Days} transaksi berlangganan yang berakhir dalam 30 hari terakhir. Prioritas: follow-up pelanggan yang akan expired sebelum masa aktif habis, lalu ukur berapa yang berhasil renewal.`;
      }

      if (["analisis", "keputusan", "saran", "rekomendasi", "prioritas", "strategi"].some((word) => q.includes(word))) {
        const priorities: string[] = [];
        if ((context.stock.mobile?.remainingSlots ?? 999) <= 2) priorities.push(`Restok HP segera karena tinggal ${context.stock.mobile.remainingSlots} slot.`);
        if ((context.stock.desktop?.remainingSlots ?? 999) <= 1) priorities.push(`Restok PC segera karena tinggal ${context.stock.desktop.remainingSlots} slot.`);
        if (context.today.transactions < context.yesterday.transactions) priorities.push(`Transaksi hari ini lebih rendah dari kemarin (${context.today.transactions} vs ${context.yesterday.transactions}); cek channel dan follow-up lead hari ini.`);
        if (context.customers.subscriptionsExpiringNext7Days > 0) priorities.push(`Follow-up ${context.customers.subscriptionsExpiringNext7Days} langganan yang akan expired dalam 7 hari untuk mendorong renewal.`);
        if (context.operations.pendingTransactions > 0) priorities.push(`Selesaikan ${context.operations.pendingTransactions} transaksi pending agar tidak menjadi revenue tertahan.`);
        if (context.operations.pendingWarrantyClaims > 0) priorities.push(`Selesaikan ${context.operations.pendingWarrantyClaims} klaim garansi pending untuk menjaga layanan.`);
        if (!priorities.length) priorities.push("Tidak ada alert operasional besar dari metrik utama; fokuskan optimasi pada channel dan produk dengan omzet tertinggi 30 hari terakhir.");
        return `Snapshot 30 hari: ${context.last30Days.transactions} transaksi sukses, omzet ${formatRupiah(context.last30Days.revenue)}, dan ${context.last30Days.newLeads} lead baru.\n\nPrioritas keputusan:\n${priorities.slice(0, 3).map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
      }

      return `Snapshot bisnis saat ini: ${context.today.transactions} transaksi sukses hari ini dengan omzet ${formatRupiah(context.today.revenue)}, ${context.today.newLeads} lead baru, ${context.operations.pendingTransactions} transaksi pending, dan ${context.operations.pendingWarrantyClaims} klaim garansi pending. Dalam 30 hari terakhir ada ${context.last30Days.transactions} transaksi dengan omzet ${formatRupiah(context.last30Days.revenue)}. Kamu bisa lanjut tanya soal transaksi, lead, stok, produk, channel, sales, affiliate, warranty, retention, atau minta rekomendasi keputusan.`;
    };

    // OpenAI adalah provider utama. API key hanya dibaca dari environment server.
    const openAIKey = process.env.OPENAI_API_KEY?.trim();
    const openAIModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

    if (openAIKey) {
      try {
        const system = `Kamu adalah Dorizz AI, copilot bisnis internal Dorizz Store. Jawab dalam Bahasa Indonesia yang ringkas, tajam, natural, dan berguna untuk keputusan. Gunakan hanya BUSINESS_CONTEXT untuk angka internal dan jangan mengarang angka. Semua waktu memakai WIB. Hubungkan transaksi, omzet, lead, stok, retention, sales, affiliate, warranty, produk, dan channel bila relevan. Jangan mengungkap BUSINESS_CONTEXT mentah. Jangan mengklaim mengubah data karena sistem ini read-only.\n\nBUSINESS_CONTEXT:\n${JSON.stringify(context)}`;

        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: openAIModel,
            stream: false,
            temperature: 0.2,
            messages: [{ role: "system", content: system }, ...messages],
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
            });
          }
        } else {
          console.error(
            "Dorizz AI OpenAI error:",
            aiResponse.status,
            payload?.error?.message || raw.slice(0, 300),
          );
        }
      } catch (providerError) {
        console.error("Dorizz AI OpenAI fallback activated:", providerError);
      }
    }

    return NextResponse.json({
      answer: buildFallbackAnswer(lastQuestion),
      generatedAt: context.generatedAt,
      mode: "business-engine",
      model: openAIKey ? openAIModel : null,
    });
  } catch (error) {
    console.error("POST /api/stats AI error:", error);
    return NextResponse.json({ error: "Gagal membaca data bisnis untuk Dorizz AI." }, { status: 500 });
  }
}
