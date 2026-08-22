import "server-only";
import { prisma } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const COMMUNITY_POLL_MS = 2000;

type Row = Record<string, any>;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function publicMessage(row: Row, adminView = false) {
  const deleted = !!row.deleted_at;
  const replyDeleted = !!row.reply_deleted_at;
  const result: Record<string, unknown> = {
    id: row.id,
    clientMessageId: row.client_message_id,
    senderName: row.sender_type === "admin" ? "DorizzStore" : row.sender_name_snapshot,
    isAdmin: row.sender_type === "admin",
    body: deleted ? "" : row.body,
    reply: row.reply_id ? {
      id: row.reply_id,
      senderName: row.reply_sender_type === "admin" ? "DorizzStore" : row.reply_sender_name,
      body: replyDeleted ? "" : row.reply_body,
      deleted: replyDeleted,
    } : null,
    createdAt: new Date(row.created_at).toISOString(),
    deleted,
  };
  if (adminView && row.sender_type === "member") result.memberId = row.member_id;
  return result;
}

const MESSAGE_SELECT = `
 SELECT m.id,m.client_message_id,m.sender_type,m.member_id,m.admin_id,
        m.sender_name_snapshot,m.body,m.created_at,m.deleted_at,
        r.id AS reply_id,r.sender_type AS reply_sender_type,
        r.sender_name_snapshot AS reply_sender_name,r.body AS reply_body,
        r.deleted_at AS reply_deleted_at
 FROM member_community_messages m
 LEFT JOIN member_community_messages r ON r.id=m.reply_to_id`;

export async function getActiveMember(memberId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE member_community_restrictions SET status='active',muted_until=NULL,reason=NULL,updated_at=now()
     WHERE member_id=$1::uuid AND status='muted' AND muted_until<=now()`, memberId
  );
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT m.id,m.name,m.status,COALESCE(r.status,'active') community_status,r.muted_until
     FROM members m LEFT JOIN member_community_restrictions r ON r.member_id=m.id
     WHERE m.id=$1::uuid LIMIT 1`, memberId
  );
  const row = rows[0];
  if (!row || row.status !== "active") return { ok: false as const, status: 403, error: "Member tidak aktif" };
  if (row.community_status === "banned") return { ok: false as const, status: 403, error: "Akses komunitas dibatasi" };
  return { ok: true as const, member: row };
}

export async function listMessages(input: { direction?: string; cursorId?: string | null; cursorAt?: string | null; limit?: number; adminView?: boolean }) {
  const direction = input.direction || "initial";
  if (!["initial", "before", "after"].includes(direction)) throw new Error("BAD_DIRECTION");
  const max = direction === "after" ? 100 : 50;
  const limit = Math.max(1, Math.min(max, Number(input.limit || max)));
  let rows: Row[];
  if (direction === "initial") {
    rows = await prisma.$queryRawUnsafe<Row[]>(`${MESSAGE_SELECT} ORDER BY m.created_at DESC,m.id DESC LIMIT $1`, limit + 1);
  } else {
    if (!isUuid(input.cursorId) || !input.cursorAt || Number.isNaN(new Date(input.cursorAt).getTime())) throw new Error("BAD_CURSOR");
    const op = direction === "before" ? "<" : ">";
    const order = direction === "before" ? "DESC" : "ASC";
    rows = await prisma.$queryRawUnsafe<Row[]>(
      `${MESSAGE_SELECT} WHERE (m.created_at,m.id) ${op} ($1::timestamptz,$2::uuid) ORDER BY m.created_at ${order},m.id ${order} LIMIT $3`,
      input.cursorAt, input.cursorId, limit + 1
    );
  }
  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
  if (direction === "initial" || direction === "before") rows.reverse();
  return { messages: rows.map((row) => publicMessage(row, !!input.adminView)), hasMore };
}

export async function sendMessage(input: { actorType: "member" | "admin"; actorId: string; actorName: string; clientMessageId: string; body: string; replyToId?: string | null; adminView?: boolean }) {
  if (!isUuid(input.clientMessageId)) throw new Error("BAD_CLIENT_ID");
  const body = input.body.trim();
  if (!body) throw new Error("EMPTY_MESSAGE");
  if ([...body].length > 2000) throw new Error("MESSAGE_TOO_LONG");
  if (input.replyToId && !isUuid(input.replyToId)) throw new Error("BAD_REPLY");

  if (input.actorType === "member") {
    const state = await getActiveMember(input.actorId);
    if (!state.ok) throw new Error(state.error === "Akses komunitas dibatasi" ? "COMMUNITY_BANNED" : "MEMBER_INACTIVE");
    if (state.member.community_status === "muted") {
      const error = new Error("COMMUNITY_MUTED") as Error & { mutedUntil?: string };
      error.mutedUntil = state.member.muted_until ? new Date(state.member.muted_until).toISOString() : undefined;
      throw error;
    }
    const rate = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int count FROM member_community_messages WHERE member_id=$1::uuid AND created_at>now()-interval '10 seconds'`, input.actorId
    );
    if (Number(rate[0]?.count || 0) >= 5) throw new Error("RATE_LIMIT");
  }

  if (input.replyToId) {
    const reply = await prisma.$queryRawUnsafe<Row[]>(`SELECT id FROM member_community_messages WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`, input.replyToId);
    if (!reply[0]) throw new Error("REPLY_NOT_FOUND");
  }

  const name = input.actorType === "admin" ? "DorizzStore" : (input.actorName.trim().split(/\s+/)[0] || "Member");
  const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO member_community_messages(client_message_id,sender_type,member_id,admin_id,sender_name_snapshot,body,reply_to_id)
     VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::uuid)
     ON CONFLICT(client_message_id) DO NOTHING RETURNING id`,
    input.clientMessageId, input.actorType, input.actorType === "member" ? input.actorId : null,
    input.actorType === "admin" ? input.actorId : null, name, body, input.replyToId || null
  );
  let id = inserted[0]?.id;
  if (!id) {
    const existing = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id,sender_type,member_id,admin_id FROM member_community_messages WHERE client_message_id=$1::uuid LIMIT 1`, input.clientMessageId
    );
    const row = existing[0];
    const same = row && row.sender_type === input.actorType && (input.actorType === "member" ? row.member_id === input.actorId : row.admin_id === input.actorId);
    if (!same) throw new Error("CLIENT_ID_CONFLICT");
    id = row.id;
  }
  const rows = await prisma.$queryRawUnsafe<Row[]>(`${MESSAGE_SELECT} WHERE m.id=$1::uuid LIMIT 1`, id);
  return publicMessage(rows[0], !!input.adminView);
}

export async function listRestrictions() {
  await prisma.$executeRawUnsafe(`UPDATE member_community_restrictions SET status='active',muted_until=NULL,reason=NULL,updated_at=now() WHERE status='muted' AND muted_until<=now()`);
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT r.member_id,m.name,r.status,r.muted_until,r.reason,r.updated_at
     FROM member_community_restrictions r JOIN members m ON m.id=r.member_id
     WHERE r.status='banned' OR (r.status='muted' AND r.muted_until>now())
     ORDER BY r.updated_at DESC LIMIT 200`
  );
  return rows.map(row => ({ memberId: row.member_id, name: row.name, status: row.status, mutedUntil: row.muted_until ? new Date(row.muted_until).toISOString() : null, reason: row.reason || "", updatedAt: new Date(row.updated_at).toISOString() }));
}

export async function moderate(input: { adminId: string; action: string; memberId?: string; messageId?: string; durationMinutes?: number; reason: string }) {
  const reason = input.reason.trim().slice(0, 500) || "Moderasi komunitas";
  if (input.action === "delete") {
    if (!isUuid(input.messageId)) throw new Error("BAD_MESSAGE");
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `UPDATE member_community_messages SET deleted_at=now(),deleted_by_admin_id=$2::uuid,delete_reason=$3
       WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id,member_id`, input.messageId, input.adminId, reason
    );
    if (!rows[0]) throw new Error("MESSAGE_NOT_FOUND");
    await prisma.$executeRawUnsafe(
      `INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason)
       VALUES($1::uuid,$2::uuid,'community_message_deleted','community_message',$3::uuid,$4)`, input.adminId, rows[0].member_id || null, input.messageId, reason
    );
    return;
  }
  if (!isUuid(input.memberId)) throw new Error("BAD_MEMBER");
  const exists = await prisma.$queryRawUnsafe<Row[]>(`SELECT id FROM members WHERE id=$1::uuid LIMIT 1`, input.memberId);
  if (!exists[0]) throw new Error("MEMBER_NOT_FOUND");
  if (input.action === "mute") {
    if (![60,1440].includes(Number(input.durationMinutes))) throw new Error("BAD_DURATION");
    await prisma.$executeRawUnsafe(
      `INSERT INTO member_community_restrictions(member_id,status,muted_until,reason,updated_by_admin_id,updated_at)
       VALUES($1::uuid,'muted',now()+($2::int*interval '1 minute'),$3,$4::uuid,now())
       ON CONFLICT(member_id) DO UPDATE SET status='muted',muted_until=EXCLUDED.muted_until,reason=EXCLUDED.reason,updated_by_admin_id=EXCLUDED.updated_by_admin_id,updated_at=now()`,
      input.memberId, input.durationMinutes, reason, input.adminId
    );
    await prisma.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason) VALUES($1::uuid,$2::uuid,'community_member_muted','member',$2::uuid,$3)`, input.adminId, input.memberId, reason);
    return;
  }
  if (input.action === "ban") {
    await prisma.$executeRawUnsafe(
      `INSERT INTO member_community_restrictions(member_id,status,muted_until,reason,updated_by_admin_id,updated_at)
       VALUES($1::uuid,'banned',NULL,$2,$3::uuid,now()) ON CONFLICT(member_id) DO UPDATE SET status='banned',muted_until=NULL,reason=EXCLUDED.reason,updated_by_admin_id=EXCLUDED.updated_by_admin_id,updated_at=now()`,
      input.memberId, reason, input.adminId
    );
    await prisma.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason) VALUES($1::uuid,$2::uuid,'community_member_banned','member',$2::uuid,$3)`, input.adminId, input.memberId, reason);
    return;
  }
  if (input.action === "unban" || input.action === "unmute") {
    const current = await prisma.$queryRawUnsafe<Row[]>(`SELECT status FROM member_community_restrictions WHERE member_id=$1::uuid LIMIT 1`, input.memberId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO member_community_restrictions(member_id,status,muted_until,reason,updated_by_admin_id,updated_at)
       VALUES($1::uuid,'active',NULL,NULL,$2::uuid,now()) ON CONFLICT(member_id) DO UPDATE SET status='active',muted_until=NULL,reason=NULL,updated_by_admin_id=EXCLUDED.updated_by_admin_id,updated_at=now()`,
      input.memberId, input.adminId
    );
    const activity = current[0]?.status === "muted" ? "community_member_unmuted" : "community_member_unbanned";
    await prisma.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason) VALUES($1::uuid,$2::uuid,$3,'member',$2::uuid,$4)`, input.adminId, input.memberId, activity, reason);
    return;
  }
  throw new Error("BAD_ACTION");
}
