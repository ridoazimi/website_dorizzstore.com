import "server-only";

import { prisma } from "@/lib/db";
import type { AiAccess } from "@/lib/dorizz-ai-reader";
import type { PermissionKey } from "@/lib/auth-shared";

const DAY_MS = 24 * 60 * 60 * 1000;

function allowed(access: AiAccess, permission: PermissionKey) {
  return access.isDeveloper || access.permissions?.[permission] === true;
}

function requireAccess(access: AiAccess, permission: PermissionKey) {
  if (!allowed(access, permission)) throw new Error("NO_PERMISSION");
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

function resolveRange(args: any) {
  const today = new Date(`${jakartaDateKey()}T00:00:00.000Z`);
  const endToday = new Date(today.getTime() + DAY_MS);
  if (args.date_from || args.date_to) {
    return {
      start: args.date_from ? new Date(`${args.date_from}T00:00:00.000Z`) : undefined,
      end: args.date_to ? new Date(new Date(`${args.date_to}T00:00:00.000Z`).getTime() + DAY_MS) : undefined,
    };
  }
  const period = String(args.period || "all_time");
  if (period === "today") return { start: today, end: endToday };
  if (period === "yesterday") return { start: new Date(today.getTime() - DAY_MS), end: today };
  if (period === "last7days") return { start: new Date(today.getTime() - 6 * DAY_MS), end: endToday };
  if (period === "last30days") return { start: new Date(today.getTime() - 29 * DAY_MS), end: endToday };
  return { start: undefined, end: undefined };
}

function rangeFilter(range: { start?: Date; end?: Date }) {
  const filter: any = {};
  if (range.start) filter.gte = range.start;
  if (range.end) filter.lt = range.end;
  return Object.keys(filter).length ? filter : undefined;
}

function limitOf(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(50, Math.floor(n))) : 20;
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const DORIZZ_AI_RELATION_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_dorizz_relation_data",
      description: "Baca tabel relasi/operasional Dorizz Store yang lebih spesifik: affiliate_commissions, affiliate_withdrawals, scheduled_recipients, customer_tags, admin_schedules, task_assignments. Read-only dan tetap mengikuti permission admin.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", enum: ["affiliate_commissions", "affiliate_withdrawals", "scheduled_recipients", "customer_tags", "admin_schedules", "task_assignments"] },
          search: { type: "string" },
          status: { type: "string" },
          date_from: { type: "string" },
          date_to: { type: "string" },
          period: { type: "string", enum: ["today", "yesterday", "last7days", "last30days", "all_time"] },
          limit: { type: "integer", minimum: 1, maximum: 50 },
          include_contacts: { type: "boolean" },
        },
        required: ["domain"],
      },
    },
  },
] as const;

export async function executeDorizzRelationTool(name: string, rawArgs: unknown, access: AiAccess) {
  if (name !== "query_dorizz_relation_data") return { error: "Tool relasi tidak dikenal." };
  const args: any = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const domain = String(args.domain || "");
  const search = String(args.search || "").trim();
  const status = String(args.status || "").trim();
  const includeContacts = args.include_contacts === true;
  const limit = limitOf(args.limit);
  const range = resolveRange(args);
  const date = rangeFilter(range);

  try {
    if (domain === "affiliate_commissions") {
      requireAccess(access, "page_affiliates");
      const where: any = {};
      if (date) where.createdAt = date;
      if (status && status !== "all") where.status = status;
      if (search) {
        where.OR = [
          { affiliate: { name: { contains: search, mode: "insensitive" } } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { transaction: { lynkIdRef: { contains: search, mode: "insensitive" } } },
        ];
      }
      const [rows, total] = await Promise.all([
        prisma.affiliateCommission.findMany({
          where,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            affiliate: { select: { id: true, name: true, email: true, whatsapp: true } },
            user: { select: { id: true, name: true, email: true, whatsapp: true } },
            transaction: { select: { id: true, lynkIdRef: true, productName: true, source: true, status: true, purchaseDate: true } },
          },
        }),
        prisma.affiliateCommission.count({ where }),
      ]);
      return {
        domain,
        total,
        shown: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          amount: num(r.amount),
          transactionAmount: num(r.transactionAmount),
          status: r.status,
          createdAt: r.createdAt,
          affiliate: r.affiliate ? { id: r.affiliate.id, name: r.affiliate.name, ...(includeContacts ? { email: r.affiliate.email, whatsapp: r.affiliate.whatsapp } : {}) } : null,
          customer: r.user ? { id: r.user.id, name: r.user.name, ...(includeContacts ? { email: r.user.email, whatsapp: r.user.whatsapp } : {}) } : null,
          transaction: r.transaction,
        })),
      };
    }

    if (domain === "affiliate_withdrawals") {
      requireAccess(access, "page_affiliates");
      const where: any = {};
      if (date) where.createdAt = date;
      if (status && status !== "all") where.status = status;
      if (search) where.affiliate = { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { whatsapp: { contains: search } }] };
      const [rows, total] = await Promise.all([
        prisma.affiliateWithdrawal.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { affiliate: { select: { id: true, name: true, email: true, whatsapp: true, status: true } } } }),
        prisma.affiliateWithdrawal.count({ where }),
      ]);
      return { domain, total, shown: rows.length, rows: rows.map((r) => ({ id: r.id, amount: num(r.amount), status: r.status, notes: r.notes, createdAt: r.createdAt, processedAt: r.processedAt, affiliate: r.affiliate ? { id: r.affiliate.id, name: r.affiliate.name, status: r.affiliate.status, ...(includeContacts ? { email: r.affiliate.email, whatsapp: r.affiliate.whatsapp } : {}) } : null })) };
    }

    if (domain === "scheduled_recipients") {
      requireAccess(access, "page_followup");
      const where: any = {};
      if (date) where.sentAt = date;
      if (status && status !== "all") where.status = status;
      if (search) where.OR = [{ customerName: { contains: search, mode: "insensitive" } }, { whatsappNumber: { contains: search } }, { followup: { title: { contains: search, mode: "insensitive" } } }];
      const [rows, total] = await Promise.all([
        prisma.scheduledFollowupRecipient.findMany({ where, take: limit, orderBy: { sentAt: "desc" }, include: { followup: { select: { id: true, title: true, scheduledAt: true, status: true } } } }),
        prisma.scheduledFollowupRecipient.count({ where }),
      ]);
      return { domain, total, shown: rows.length, rows: rows.map((r) => ({ id: r.id, customerName: r.customerName, ...(includeContacts ? { whatsappNumber: r.whatsappNumber } : {}), status: r.status, sentAt: r.sentAt, followup: r.followup })) };
    }

    if (domain === "customer_tags") {
      requireAccess(access, "page_customers");
      const where: any = {};
      if (search) where.OR = [{ user: { name: { contains: search, mode: "insensitive" } } }, { user: { email: { contains: search, mode: "insensitive" } } }, { tag: { name: { contains: search, mode: "insensitive" } } }];
      const rows = await prisma.customerTag.findMany({ where, take: limit, orderBy: { assignedAt: "desc" }, include: { user: { select: { id: true, name: true, email: true, whatsapp: true } }, tag: true } });
      return { domain, shown: rows.length, rows: rows.map((r) => ({ assignedAt: r.assignedAt, tag: { id: r.tag.id, name: r.tag.name, color: r.tag.color }, customer: { id: r.user.id, name: r.user.name, ...(includeContacts ? { email: r.user.email, whatsapp: r.user.whatsapp } : {}) } })) };
    }

    if (domain === "admin_schedules") {
      requireAccess(access, "page_absensi");
      const where: any = {};
      if (status === "active") where.isActive = true;
      if (status === "inactive") where.isActive = false;
      if (search) where.admin = { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] };
      const [rows, total] = await Promise.all([
        prisma.adminSchedule.findMany({ where, take: limit, orderBy: { updatedAt: "desc" }, include: { admin: { select: { id: true, name: true, email: true, whatsapp: true, role: true, status: true } } } }),
        prisma.adminSchedule.count({ where }),
      ]);
      return { domain, total, shown: rows.length, rows: rows.map((r) => ({ id: r.id, shiftStart: r.shiftStart, shiftEnd: r.shiftEnd, isActive: r.isActive, admin: { id: r.admin.id, name: r.admin.name, role: r.admin.role, status: r.admin.status, ...(includeContacts ? { email: r.admin.email, whatsapp: r.admin.whatsapp } : {}) } })) };
    }

    if (domain === "task_assignments") {
      requireAccess(access, "page_absensi");
      const where: any = {};
      if (status && status !== "all") where.status = status;
      if (args.date_from || args.date_to) {
        where.date = {};
        if (args.date_from) where.date.gte = args.date_from;
        if (args.date_to) where.date.lte = args.date_to;
      }
      if (search) where.OR = [{ task: { title: { contains: search, mode: "insensitive" } } }, { admin: { name: { contains: search, mode: "insensitive" } } }, { admin: { email: { contains: search, mode: "insensitive" } } }];
      const [rows, total] = await Promise.all([
        prisma.taskAssignment.findMany({ where, take: limit, orderBy: { date: "desc" }, include: { task: { select: { id: true, title: true, description: true, recurrenceType: true } }, admin: { select: { id: true, name: true, email: true, role: true } } } }),
        prisma.taskAssignment.count({ where }),
      ]);
      return { domain, total, shown: rows.length, rows: rows.map((r) => ({ id: r.id, date: r.date, status: r.status, completedAt: r.completedAt, assignedAt: r.assignedAt, task: r.task, admin: { id: r.admin.id, name: r.admin.name, role: r.admin.role, ...(includeContacts ? { email: r.admin.email } : {}) } })) };
    }

    return { error: "Domain relasi tidak dikenal." };
  } catch (error) {
    if (error instanceof Error && error.message === "NO_PERMISSION") return { error: "Akses ditolak untuk data tersebut berdasarkan permission admin." };
    console.error("[Dorizz AI relation tool]", error);
    return { error: "Gagal membaca tabel relasi Dorizz Store." };
  }
}
