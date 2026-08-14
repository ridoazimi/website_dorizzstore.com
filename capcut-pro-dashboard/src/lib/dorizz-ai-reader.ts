import "server-only";

import { prisma } from "@/lib/db";
import type { PermissionKey } from "@/lib/auth-shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AiAccess = {
  isDeveloper: boolean;
  permissions: Record<string, boolean> | null;
};

type QueryArgs = {
  domain?: string;
  search?: string;
  status?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  period?: string;
  product_type?: string;
  usage_type?: string;
  category?: string;
  limit?: number;
  include_contacts?: boolean;
};

type MetricArgs = {
  period?: string;
  date_from?: string;
  date_to?: string;
  group_by?: string;
};

function hasPermission(access: AiAccess, permission: PermissionKey) {
  return access.isDeveloper || access.permissions?.[permission] === true;
}

function assertPermission(access: AiAccess, permission: PermissionKey) {
  if (!hasPermission(access, permission)) {
    throw new Error(`NO_PERMISSION:${permission}`);
  }
}

function jakartaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function utcDayStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function dateKeyFromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveRange(args: { period?: string; date_from?: string; date_to?: string }) {
  const todayKey = jakartaDateKey();
  const todayStart = utcDayStart(todayKey);
  const todayEnd = new Date(todayStart.getTime() + DAY_MS);
  const period = (args.period || "today").toLowerCase();

  if (args.date_from || args.date_to) {
    const start = args.date_from ? utcDayStart(args.date_from) : undefined;
    const end = args.date_to ? new Date(utcDayStart(args.date_to).getTime() + DAY_MS) : undefined;
    return { start, end, label: `${args.date_from || "awal"} s/d ${args.date_to || "sekarang"}` };
  }

  if (period === "all_time") return { start: undefined, end: undefined, label: "semua waktu" };
  if (period === "yesterday") {
    return { start: new Date(todayStart.getTime() - DAY_MS), end: todayStart, label: "kemarin" };
  }
  if (period === "last7days") {
    return { start: new Date(todayStart.getTime() - 6 * DAY_MS), end: todayEnd, label: "7 hari terakhir" };
  }
  if (period === "last30days") {
    return { start: new Date(todayStart.getTime() - 29 * DAY_MS), end: todayEnd, label: "30 hari terakhir" };
  }
  if (period === "this_month") {
    const [year, month] = todayKey.split("-").map(Number);
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: todayEnd, label: "bulan ini" };
  }
  if (period === "last_month") {
    const [year, month] = todayKey.split("-").map(Number);
    const thisMonthStart = new Date(Date.UTC(year, month - 1, 1));
    const lastMonthStart = new Date(Date.UTC(year, month - 2, 1));
    return { start: lastMonthStart, end: thisMonthStart, label: "bulan lalu" };
  }
  return { start: todayStart, end: todayEnd, label: "hari ini" };
}

function dateFilter(range: { start?: Date; end?: Date }) {
  const filter: Record<string, Date> = {};
  if (range.start) filter.gte = range.start;
  if (range.end) filter.lt = range.end;
  return Object.keys(filter).length ? filter : undefined;
}

function safeLimit(value: unknown, fallback = 20, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function numeric(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function domainPermission(domain: string): PermissionKey {
  const map: Record<string, PermissionKey> = {
    customers: "page_customers",
    transactions: "page_transactions",
    expirations: "page_transactions",
    stock: "page_stock",
    warranty: "page_warranty",
    sales: "page_sales",
    affiliates: "page_affiliates",
    messages: "page_messages",
    followups: "page_followup",
    products: "page_marketplace",
    vouchers: "page_vouchers",
    tasks: "page_absensi",
    attendance: "page_absensi",
    testimonials: "page_testimonials",
    settings: "page_settings",
    admin_users: "page_settings",
    tags: "page_customers",
    data_nomor: "page_settings",
  };
  return map[domain] || "page_ai";
}

export const DORIZZ_AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_dorizz_metrics",
      description: "Ambil metrik agregat live dari database Dorizz Store. Gunakan untuk omzet, jumlah transaksi, status, source/channel, produk, tren harian, tipe customer, performa sales, atau affiliate.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "yesterday", "last7days", "last30days", "this_month", "last_month", "all_time"] },
          date_from: { type: "string", description: "Tanggal awal YYYY-MM-DD bila custom." },
          date_to: { type: "string", description: "Tanggal akhir YYYY-MM-DD bila custom." },
          group_by: { type: "string", enum: ["summary", "status", "source", "product", "day", "customer_type", "sales", "affiliate"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_dorizz_data",
      description: "Baca record database Dorizz Store secara read-only. Domain tersedia: customers, transactions, expirations, stock, warranty, sales, affiliates, messages, followups, products, vouchers, tasks, attendance, testimonials, settings, admin_users, tags, data_nomor. Gunakan include_contacts=true hanya saat user meminta nama/email/nomor WhatsApp atau data kontak.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", enum: ["customers", "transactions", "expirations", "stock", "warranty", "sales", "affiliates", "messages", "followups", "products", "vouchers", "tasks", "attendance", "testimonials", "settings", "admin_users", "tags", "data_nomor"] },
          search: { type: "string", description: "Pencarian nama, email, WhatsApp, ID/ref, judul, kode, atau teks sesuai domain." },
          status: { type: "string", description: "Filter status bila relevan, mis. success, pending, active, inactive, resolved." },
          source: { type: "string", description: "Filter source transaksi bila relevan." },
          date_from: { type: "string", description: "Tanggal awal YYYY-MM-DD." },
          date_to: { type: "string", description: "Tanggal akhir YYYY-MM-DD." },
          period: { type: "string", enum: ["today", "yesterday", "last7days", "last30days", "this_month", "last_month", "all_time"] },
          product_type: { type: "string", description: "mobile/desktop untuk stok." },
          usage_type: { type: "string", description: "sale/warranty untuk stok." },
          category: { type: "string", description: "Kategori sales/produk bila relevan." },
          limit: { type: "integer", minimum: 1, maximum: 50 },
          include_contacts: { type: "boolean", description: "Sertakan email/WhatsApp bila user memang meminta data kontak." },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_profile",
      description: "Cari satu customer berdasarkan nama, email, WhatsApp, atau UUID dan ambil profil lengkap: kontak, notes, tags, transaksi terakhir, message log, referral. Gunakan saat user menanyakan customer tertentu atau meminta nomor customer tertentu.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string" },
          transaction_limit: { type: "integer", minimum: 1, maximum: 30 },
          message_limit: { type: "integer", minimum: 1, maximum: 30 },
        },
        required: ["identifier"],
      },
    },
  },
] as const;

async function getMetrics(args: MetricArgs, access: AiAccess) {
  assertPermission(access, "page_transactions");
  const range = resolveRange(args);
  const purchaseDate = dateFilter(range);
  const groupBy = (args.group_by || "summary").toLowerCase();
  const successWhere: any = { status: "success" };
  const allWhere: any = {};
  if (purchaseDate) {
    successWhere.purchaseDate = purchaseDate;
    allWhere.purchaseDate = purchaseDate;
  }

  if (groupBy === "status") {
    const rows = await prisma.transaction.groupBy({ by: ["status"], where: allWhere, _count: { _all: true }, _sum: { amount: true } });
    return { period: range.label, rows: rows.map((r) => ({ status: r.status || "unknown", transactions: r._count._all, amount: numeric(r._sum.amount) })) };
  }

  if (groupBy === "source") {
    const rows = await prisma.transaction.groupBy({ by: ["source"], where: successWhere, _count: { _all: true }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } } });
    return { period: range.label, rows: rows.map((r) => ({ source: r.source || "unknown", transactions: r._count._all, revenue: numeric(r._sum.amount) })) };
  }

  if (groupBy === "product") {
    const rows = await prisma.transaction.groupBy({ by: ["productName"], where: successWhere, _count: { _all: true }, _sum: { amount: true }, orderBy: { _count: { productName: "desc" } }, take: 20 });
    return { period: range.label, rows: rows.map((r) => ({ product: r.productName || "unknown", transactions: r._count._all, revenue: numeric(r._sum.amount) })) };
  }

  if (groupBy === "day") {
    const rows = await prisma.transaction.findMany({ where: successWhere, select: { purchaseDate: true, amount: true }, orderBy: { purchaseDate: "asc" }, take: 5000 });
    const byDay: Record<string, { transactions: number; revenue: number }> = {};
    for (const row of rows) {
      const key = row.purchaseDate ? dateKeyFromUtc(row.purchaseDate) : "unknown";
      const current = byDay[key] || { transactions: 0, revenue: 0 };
      current.transactions += 1;
      current.revenue += numeric(row.amount);
      byDay[key] = current;
    }
    return { period: range.label, rows: Object.entries(byDay).map(([date, value]) => ({ date, ...value })) };
  }

  if (groupBy === "customer_type") {
    assertPermission(access, "page_customers");
    const rows = await prisma.transaction.findMany({ where: successWhere, select: { userId: true, user: { select: { customerType: true } } }, take: 5000 });
    const seen = new Set<string>();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (!row.userId || seen.has(row.userId)) continue;
      seen.add(row.userId);
      const type = row.user?.customerType || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    }
    return { period: range.label, uniqueBuyers: seen.size, rows: Object.entries(counts).map(([customerType, customers]) => ({ customerType, customers })) };
  }

  if (groupBy === "sales") {
    assertPermission(access, "page_sales");
    const rows = await prisma.transaction.groupBy({ by: ["salesId"], where: { ...successWhere, salesId: { not: null } }, _count: { _all: true }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } } });
    const ids = rows.map((r) => r.salesId).filter(Boolean) as string[];
    const sales = await prisma.salesTeam.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true, category: true } });
    const map = new Map(sales.map((s) => [s.id, s]));
    return { period: range.label, rows: rows.map((r) => ({ sales: r.salesId ? map.get(r.salesId) || null : null, transactions: r._count._all, revenue: numeric(r._sum.amount) })) };
  }

  if (groupBy === "affiliate") {
    assertPermission(access, "page_affiliates");
    const createdAt = dateFilter(range);
    const where: any = {};
    if (createdAt) where.createdAt = createdAt;
    const rows = await prisma.affiliateCommission.groupBy({ by: ["affiliateId"], where, _count: { _all: true }, _sum: { amount: true, transactionAmount: true }, orderBy: { _sum: { transactionAmount: "desc" } } });
    const ids = rows.map((r) => r.affiliateId).filter(Boolean) as string[];
    const affiliates = await prisma.affiliate.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true } });
    const map = new Map(affiliates.map((a) => [a.id, a]));
    return { period: range.label, rows: rows.map((r) => ({ affiliate: r.affiliateId ? map.get(r.affiliateId) || null : null, events: r._count._all, attributedRevenue: numeric(r._sum.transactionAmount), commissions: numeric(r._sum.amount) })) };
  }

  const [statuses, success, uniqueBuyers] = await Promise.all([
    prisma.transaction.groupBy({ by: ["status"], where: allWhere, _count: { _all: true } }),
    prisma.transaction.aggregate({ where: successWhere, _count: { _all: true }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["userId"], where: { ...successWhere, userId: { not: null } }, _count: { _all: true } }),
  ]);

  const result: any = {
    period: range.label,
    totalTransactions: statuses.reduce((sum, row) => sum + row._count._all, 0),
    statusBreakdown: statuses.map((row) => ({ status: row.status || "unknown", transactions: row._count._all })),
    successTransactions: success._count._all,
    successRevenue: numeric(success._sum.amount),
    uniqueBuyers: uniqueBuyers.length,
  };

  if (hasPermission(access, "page_customers")) {
    const createdAt = dateFilter(range);
    result.newCustomers = await prisma.user.count({ where: createdAt ? { createdAt } : {} });
  }
  return result;
}

async function queryDomain(args: QueryArgs, access: AiAccess) {
  const domain = String(args.domain || "").toLowerCase();
  assertPermission(access, domainPermission(domain));
  const limit = safeLimit(args.limit);
  const range = resolveRange(args);
  const includeContacts = args.include_contacts === true;
  const search = (args.search || "").trim();

  if (domain === "customers") {
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { whatsapp: { contains: search } }];
    if (args.status && args.status !== "all") where.subscriptionStatus = args.status;
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          tags: { include: { tag: true } },
          transactions: { where: { status: "success" }, orderBy: { purchaseDate: "desc" }, take: 3, select: { id: true, amount: true, productName: true, source: true, purchaseDate: true, warrantyExpiredAt: true } },
          _count: { select: { transactions: true, messageLogs: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return {
      domain,
      total,
      shown: rows.length,
      rows: rows.map((u) => ({
        id: u.id,
        name: u.name,
        ...(includeContacts ? { email: u.email, whatsapp: u.whatsapp } : {}),
        customerType: u.customerType,
        subscriptionStatus: u.subscriptionStatus,
        followUpStatus: u.followUpStatus,
        notes: u.notes,
        createdAt: u.createdAt,
        tags: u.tags.map((t) => t.tag.name),
        transactionCount: u._count.transactions,
        messageCount: u._count.messageLogs,
        recentSuccessTransactions: u.transactions.map((t) => ({ ...t, amount: numeric(t.amount) })),
      })),
    };
  }

  if (domain === "transactions") {
    const where: any = {};
    const purchaseDate = dateFilter(range);
    if (purchaseDate) where.purchaseDate = purchaseDate;
    if (args.status && args.status !== "all") where.status = args.status;
    if (args.source && args.source !== "all") where.source = { equals: args.source, mode: "insensitive" };
    if (search) {
      where.OR = [
        { id: /^[0-9a-f-]{36}$/i.test(search) ? search : undefined },
        { lynkIdRef: { contains: search, mode: "insensitive" } },
        { productName: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { whatsapp: { contains: search } } },
      ].filter((item) => !Object.values(item).some((value) => value === undefined));
    }
    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({ where, take: limit, orderBy: { purchaseDate: "desc" }, include: { user: { select: { id: true, name: true, email: true, whatsapp: true } }, sales: { select: { id: true, name: true, code: true } }, stockAccount: { select: { accountEmail: true } } } }),
      prisma.transaction.count({ where }),
    ]);
    return {
      domain,
      period: range.label,
      total,
      shown: rows.length,
      rows: rows.map((t) => ({
        id: t.id,
        lynkIdRef: t.lynkIdRef,
        status: t.status,
        source: t.source,
        amount: numeric(t.amount),
        productName: t.productName,
        purchaseDate: t.purchaseDate,
        warrantyExpiredAt: t.warrantyExpiredAt,
        voucherCode: t.voucherCode,
        customer: t.user ? { id: t.user.id, name: t.user.name, ...(includeContacts ? { email: t.user.email, whatsapp: t.user.whatsapp } : {}) } : null,
        sales: t.sales,
        assignedAccountEmail: t.stockAccount?.accountEmail || null,
      })),
    };
  }

  if (domain === "expirations") {
    const warrantyExpiredAt = dateFilter(range);
    const where: any = { status: args.status && args.status !== "all" ? args.status : "success" };
    if (warrantyExpiredAt) where.warrantyExpiredAt = warrantyExpiredAt;
    if (search) where.OR = [{ user: { name: { contains: search, mode: "insensitive" } } }, { user: { email: { contains: search, mode: "insensitive" } } }, { user: { whatsapp: { contains: search } } }, { productName: { contains: search, mode: "insensitive" } }];
    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({ where, take: limit, orderBy: { warrantyExpiredAt: "asc" }, include: { user: { select: { id: true, name: true, email: true, whatsapp: true } }, sales: { select: { name: true, code: true } } } }),
      prisma.transaction.count({ where }),
    ]);
    return {
      domain,
      period: range.label,
      total,
      shown: rows.length,
      rows: rows.map((t) => ({ id: t.id, customer: t.user ? { id: t.user.id, name: t.user.name, ...(includeContacts ? { email: t.user.email, whatsapp: t.user.whatsapp } : {}) } : null, productName: t.productName, purchaseDate: t.purchaseDate, expiresAt: t.warrantyExpiredAt, amount: numeric(t.amount), source: t.source, sales: t.sales })),
    };
  }

  if (domain === "stock") {
    const where: any = {};
    if (search) where.accountEmail = { contains: search, mode: "insensitive" };
    if (args.status && args.status !== "all") where.status = args.status;
    if (args.product_type && args.product_type !== "all") where.productType = args.product_type;
    if (args.usage_type && args.usage_type !== "all") where.usageType = args.usage_type;
    const [rows, total] = await Promise.all([
      prisma.stockAccount.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { product: { select: { id: true, name: true, maxSlots: true } } } }),
      prisma.stockAccount.count({ where }),
    ]);
    return {
      domain,
      total,
      shown: rows.length,
      rows: rows.map((s) => { const max = s.maxSlots ?? s.product?.maxSlots ?? (s.productType === "desktop" ? 2 : 3); const used = s.usedSlots ?? 0; return { id: s.id, accountEmail: s.accountEmail, status: s.status, productType: s.productType, usageType: s.usageType, product: s.product?.name || null, usedSlots: used, maxSlots: max, remainingSlots: Math.max(0, max - used), durationDays: s.durationDays, notes: s.notes, createdAt: s.createdAt }; }),
      security: "Password akun sengaja tidak pernah dikirim ke model AI.",
    };
  }

  if (domain === "warranty") {
    const createdAt = dateFilter(range);
    const where: any = {};
    if (createdAt) where.createdAt = createdAt;
    if (args.status && args.status !== "all") where.status = args.status;
    if (search) where.OR = [{ claimReason: { contains: search, mode: "insensitive" } }, { transaction: { user: { name: { contains: search, mode: "insensitive" } } } }, { transaction: { user: { whatsapp: { contains: search } } } }];
    const [rows, total] = await Promise.all([
      prisma.warrantyClaim.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { transaction: { include: { user: { select: { name: true, email: true, whatsapp: true } } } }, oldAccount: { select: { accountEmail: true } }, newAccount: { select: { accountEmail: true } } } }),
      prisma.warrantyClaim.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows: rows.map((c) => ({ id: c.id, status: c.status, claimReason: c.claimReason, evidenceUrl: c.evidenceUrl, createdAt: c.createdAt, customer: c.transaction?.user ? { name: c.transaction.user.name, ...(includeContacts ? { email: c.transaction.user.email, whatsapp: c.transaction.user.whatsapp } : {}) } : null, transactionId: c.transactionId, oldAccountEmail: c.oldAccount?.accountEmail || null, newAccountEmail: c.newAccount?.accountEmail || null })) };
  }

  if (domain === "sales") {
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { whatsapp: { contains: search } }];
    if (args.status && args.status !== "all") where.status = args.status;
    if (args.category) where.category = args.category;
    const purchaseDate = dateFilter(range);
    const rows = await prisma.salesTeam.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { transactions: { where: purchaseDate ? { purchaseDate } : {}, select: { status: true, amount: true } } } });
    return { domain, period: range.label, shown: rows.length, rows: rows.map((s) => ({ id: s.id, name: s.name, code: s.code, ...(includeContacts ? { whatsapp: s.whatsapp } : {}), status: s.status, category: s.category, totalTransactions: s.transactions.length, successTransactions: s.transactions.filter((t) => t.status === "success").length, successRevenue: s.transactions.filter((t) => t.status === "success").reduce((sum, t) => sum + numeric(t.amount), 0) })) };
  }

  if (domain === "affiliates") {
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { whatsapp: { contains: search } }];
    if (args.status && args.status !== "all") where.status = args.status;
    const createdAt = dateFilter(range);
    const rows = await prisma.affiliate.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { commissions: { where: createdAt ? { createdAt } : {}, select: { amount: true, transactionAmount: true, status: true } }, _count: { select: { referredUsers: true, withdrawals: true } } } });
    return { domain, period: range.label, shown: rows.length, rows: rows.map((a) => ({ id: a.id, name: a.name, ...(includeContacts ? { email: a.email, whatsapp: a.whatsapp } : {}), status: a.status, commissionRate: numeric(a.commissionRate), totalEarned: numeric(a.totalEarned), balance: numeric(a.balance), referredUsers: a._count.referredUsers, withdrawals: a._count.withdrawals, periodCommissionEvents: a.commissions.length, periodCommissions: a.commissions.reduce((sum, c) => sum + numeric(c.amount), 0), periodAttributedRevenue: a.commissions.reduce((sum, c) => sum + numeric(c.transactionAmount), 0) })) };
  }

  if (domain === "messages") {
    const sentAt = dateFilter(range);
    const where: any = {};
    if (sentAt) where.sentAt = sentAt;
    if (args.status && args.status !== "all") where.status = args.status;
    if (search) where.OR = [{ whatsappNumber: { contains: search } }, { messageType: { contains: search, mode: "insensitive" } }, { messageContent: { contains: search, mode: "insensitive" } }, { user: { name: { contains: search, mode: "insensitive" } } }];
    const [rows, total] = await Promise.all([
      prisma.messageLog.findMany({ where, take: limit, orderBy: { sentAt: "desc" }, include: { user: { select: { name: true, email: true, whatsapp: true } } } }),
      prisma.messageLog.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows: rows.map((m) => ({ id: m.id, messageType: m.messageType, status: m.status, sentAt: m.sentAt, customer: m.user ? { name: m.user.name, ...(includeContacts ? { email: m.user.email, whatsapp: m.user.whatsapp } : {}) } : null, whatsappNumber: includeContacts ? m.whatsappNumber : undefined, messageContent: m.messageContent, transactionId: m.transactionId })) };
  }

  if (domain === "followups") {
    const scheduledAt = dateFilter(range);
    const where: any = {};
    if (scheduledAt) where.scheduledAt = scheduledAt;
    if (args.status && args.status !== "all") where.status = args.status;
    if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }, { messageTemplate: { contains: search, mode: "insensitive" } }];
    const [rows, total] = await Promise.all([
      prisma.scheduledFollowup.findMany({ where, take: limit, orderBy: { scheduledAt: "desc" }, include: { recipients: includeContacts ? { take: 20, orderBy: { sentAt: "desc" } } : false } }),
      prisma.scheduledFollowup.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows: rows.map((f) => ({ id: f.id, title: f.title, scheduledAt: f.scheduledAt, status: f.status, totalRecipients: f.totalRecipients, sentCount: f.sentCount, messageTemplate: f.messageTemplate, ...(includeContacts ? { recipients: f.recipients } : {}) })) };
  }

  if (domain === "products") {
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }, { category: { contains: search, mode: "insensitive" } }];
    if (args.category) where.category = args.category;
    if (args.status === "active") where.isActive = true;
    if (args.status === "inactive") where.isActive = false;
    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, take: limit, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], include: { _count: { select: { stockAccounts: true, transactions: true } } } }),
      prisma.product.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows: rows.map((p) => ({ id: p.id, name: p.name, slug: p.slug, description: p.description, price: numeric(p.price), discountPercentage: p.discountPercentage, category: p.category, maxSlots: p.maxSlots, duration: p.duration, rules: p.rules, isActive: p.isActive, stockStatus: p.stockStatus, sortOrder: p.sortOrder, stockAccounts: p._count.stockAccounts, transactions: p._count.transactions })) };
  }

  if (domain === "vouchers") {
    const where: any = {};
    if (search) where.code = { contains: search, mode: "insensitive" };
    if (args.status === "active") where.isActive = true;
    if (args.status === "inactive") where.isActive = false;
    const [rows, total] = await Promise.all([prisma.voucher.findMany({ where, take: limit, orderBy: { createdAt: "desc" } }), prisma.voucher.count({ where })]);
    return { domain, total, shown: rows.length, rows: rows.map((v) => ({ id: v.id, code: v.code, type: v.type, value: numeric(v.value), maxUsage: v.maxUsage, currentUsage: v.currentUsage, minPurchase: numeric(v.minPurchase), expiryDate: v.expiryDate, isActive: v.isActive })) };
  }

  if (domain === "tasks") {
    const where: any = {};
    if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }];
    if (args.status === "active") where.isActive = true;
    if (args.status === "inactive") where.isActive = false;
    const [rows, total] = await Promise.all([
      prisma.task.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { assignments: { take: 20, orderBy: { date: "desc" }, include: { admin: { select: { name: true, email: true } } } } } }),
      prisma.task.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows };
  }

  if (domain === "attendance") {
    const where: any = {};
    if (args.date_from || args.date_to) {
      where.date = {};
      if (args.date_from) where.date.gte = args.date_from;
      if (args.date_to) where.date.lte = args.date_to;
    }
    if (search) where.admin = { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] };
    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({ where, take: limit, orderBy: { date: "desc" }, include: { admin: { select: { id: true, name: true, email: true, role: true } } } }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows };
  }

  if (domain === "testimonials") {
    const where: any = {};
    if (search) where.OR = [{ customerName: { contains: search, mode: "insensitive" } }, { topTag: { contains: search, mode: "insensitive" } }, { statusText: { contains: search, mode: "insensitive" } }];
    if (args.status === "active") where.isActive = true;
    if (args.status === "inactive") where.isActive = false;
    const [rows, total] = await Promise.all([prisma.testimonial.findMany({ where, take: limit, orderBy: { createdAt: "desc" } }), prisma.testimonial.count({ where })]);
    return { domain, total, shown: rows.length, rows };
  }

  if (domain === "settings") {
    const where: any = search ? { key: { contains: search, mode: "insensitive" } } : {};
    const rows = await prisma.appSetting.findMany({ where, take: limit, orderBy: { key: "asc" } });
    return { domain, shown: rows.length, rows };
  }

  if (domain === "admin_users") {
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { whatsapp: { contains: search } }];
    if (args.status && args.status !== "all") where.status = args.status;
    const [rows, total] = await Promise.all([
      prisma.adminUser.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true, role: true, status: true, permissions: true, whatsapp: true, createdAt: true, updatedAt: true } }),
      prisma.adminUser.count({ where }),
    ]);
    return { domain, total, shown: rows.length, rows, security: "Password admin sengaja tidak pernah dikirim ke model AI." };
  }

  if (domain === "tags") {
    const where: any = search ? { name: { contains: search, mode: "insensitive" } } : {};
    const rows = await prisma.tag.findMany({ where, take: limit, orderBy: { name: "asc" }, include: { _count: { select: { customers: true } } } });
    return { domain, shown: rows.length, rows: rows.map((t) => ({ id: t.id, name: t.name, color: t.color, customers: t._count.customers, createdAt: t.createdAt })) };
  }

  if (domain === "data_nomor") {
    const where: any = {};
    if (search) where.nomor = { contains: search };
    if (args.status && args.status !== "all") where.statusAi = args.status;
    const rows = await prisma.dataNomor.findMany({ where, take: limit, orderBy: { id: "desc" } });
    return { domain, shown: rows.length, rows };
  }

  throw new Error(`UNKNOWN_DOMAIN:${domain}`);
}

async function customerProfile(identifier: string, access: AiAccess, transactionLimit = 15, messageLimit = 10) {
  assertPermission(access, "page_customers");
  const query = identifier.trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...(uuid ? [{ id: query }] : []),
        { email: { equals: query, mode: "insensitive" } },
        { whatsapp: { equals: query } },
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { whatsapp: { contains: query } },
      ],
    },
    take: 5,
    orderBy: { updatedAt: "desc" },
    include: {
      tags: { include: { tag: true } },
      affiliate: { select: { id: true, name: true, status: true } },
      transactions: {
        take: safeLimit(transactionLimit, 15, 30),
        orderBy: { purchaseDate: "desc" },
        include: { sales: { select: { id: true, name: true, code: true } }, stockAccount: { select: { accountEmail: true } } },
      },
      messageLogs: {
        take: safeLimit(messageLimit, 10, 30),
        orderBy: { sentAt: "desc" },
        select: { id: true, messageType: true, messageContent: true, status: true, sentAt: true, transactionId: true },
      },
    },
  });

  if (!users.length) return { found: false, query };
  if (users.length > 1) {
    return { found: true, ambiguous: true, candidates: users.map((u) => ({ id: u.id, name: u.name, email: u.email, whatsapp: u.whatsapp })) };
  }

  const u = users[0];
  return {
    found: true,
    ambiguous: false,
    customer: {
      id: u.id,
      name: u.name,
      email: u.email,
      whatsapp: u.whatsapp,
      customerType: u.customerType,
      subscriptionStatus: u.subscriptionStatus,
      followUpStatus: u.followUpStatus,
      notes: u.notes,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      tags: u.tags.map((t) => t.tag.name),
      referredByAffiliate: u.affiliate,
      transactions: u.transactions.map((t) => ({ id: t.id, lynkIdRef: t.lynkIdRef, status: t.status, source: t.source, amount: numeric(t.amount), productName: t.productName, purchaseDate: t.purchaseDate, warrantyExpiredAt: t.warrantyExpiredAt, voucherCode: t.voucherCode, sales: t.sales, assignedAccountEmail: t.stockAccount?.accountEmail || null })),
      messages: u.messageLogs,
    },
  };
}

export async function executeDorizzAiTool(name: string, rawArgs: unknown, access: AiAccess) {
  try {
    const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, any>) : {};
    if (name === "get_dorizz_metrics") return await getMetrics(args, access);
    if (name === "query_dorizz_data") return await queryDomain(args, access);
    if (name === "get_customer_profile") return await customerProfile(String(args.identifier || ""), access, args.transaction_limit, args.message_limit);
    return { error: `Tool tidak dikenal: ${name}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NO_PERMISSION:")) return { error: "Akses ditolak untuk data tersebut berdasarkan permission admin." };
    if (message.startsWith("UNKNOWN_DOMAIN:")) return { error: "Domain data tidak dikenal." };
    console.error(`[Dorizz AI tool ${name}]`, error);
    return { error: "Gagal membaca data dari database Dorizz Store." };
  }
}

export async function tryDirectDorizzAnswer(question: string, access: AiAccess) {
  const q = question.toLowerCase();
  const todayWords = q.includes("hari ini") || q.includes("today");

  if (todayWords && hasPermission(access, "page_transactions") && (q.includes("transaksi") || q.includes("order") || q.includes("orderan"))) {
    if (q.includes("pending") || q.includes("sukses") || q.includes("success") || q.includes("gagal") || q.includes("failed") || q.includes("total")) {
      const data: any = await getMetrics({ period: "today", group_by: "status" }, access);
      const counts = new Map((data.rows || []).map((r: any) => [String(r.status), Number(r.transactions || 0)]));
      const total = Array.from(counts.values()).reduce((sum: number, value: any) => sum + Number(value || 0), 0);
      if (q.includes("pending")) return `Hari ini ada ${counts.get("pending") || 0} transaksi pending.`;
      if (q.includes("sukses") || q.includes("success")) return `Hari ini ada ${counts.get("success") || 0} transaksi sukses.`;
      if (q.includes("gagal") || q.includes("failed")) return `Hari ini ada ${counts.get("failed") || 0} transaksi gagal.`;
      if (q.includes("total")) return `Hari ini ada total ${total} transaksi.`;
    }
  }

  if (todayWords && hasPermission(access, "page_transactions") && (q.includes("expired") || q.includes("berakhir") || q.includes("expire"))) {
    const wantsContacts = ["nama", "siapa", "customer", "pelanggan", "nomor", "wa", "whatsapp", "email"].some((word) => q.includes(word));
    const data: any = await queryDomain({ domain: "expirations", period: "today", include_contacts: wantsContacts, limit: 50 }, access);
    if (!wantsContacts) return `Hari ini ada ${data.total || 0} langganan/transaksi sukses yang masa aktifnya berakhir.`;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) return "Tidak ada customer yang masa aktifnya berakhir hari ini.";
    const lines = rows.map((row: any, index: number) => {
      const c = row.customer || {};
      const contact = [c.whatsapp ? `WA ${c.whatsapp}` : "", c.email ? `email ${c.email}` : ""].filter(Boolean).join(", ");
      return `${index + 1}. ${c.name || "Tanpa nama"}${contact ? ` — ${contact}` : ""} — ${row.productName || "produk"}`;
    });
    return `Ada ${data.total || rows.length} customer yang masa aktifnya berakhir hari ini:\n${lines.join("\n")}`;
  }

  return null;
}
