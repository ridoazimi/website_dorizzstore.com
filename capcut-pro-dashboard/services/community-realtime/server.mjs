import http from "node:http";
import { createHash } from "node:crypto";
import { Server } from "socket.io";
import pg from "pg";
import { jwtDecrypt } from "jose";

const { Pool } = pg;

const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.COMMUNITY_DATABASE_URL;
const COMMUNITY_SECRET = process.env.COMMUNITY_JWT_SECRET;
const allowedOrigins = String(process.env.COMMUNITY_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (!DATABASE_URL) throw new Error("COMMUNITY_DATABASE_URL is required");
if (!COMMUNITY_SECRET) throw new Error("COMMUNITY_JWT_SECRET is required");
if (!allowedOrigins.length) throw new Error("COMMUNITY_ALLOWED_ORIGINS is required");

const key = new Uint8Array(createHash("sha256").update(COMMUNITY_SECRET).digest());
const pool = new Pool({ connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
const rateBuckets = new Map();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    try {
      await pool.query("SELECT 1");
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, database: true }));
    } catch {
      res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: false, database: false }));
    }
    return;
  }
  if (req.url?.startsWith("/socket.io/")) return;
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const io = new Server(server, {
  serveClient: true,
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      return callback(new Error("Origin not allowed"));
    },
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 32_000,
  transports: ["polling", "websocket"],
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((keyName) => allowed.includes(keyName));
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function messageError(code, message, extra = {}) {
  return { ok: false, error: { code, message, ...extra } };
}

function ackSafe(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

async function decryptCommunityToken(token) {
  if (typeof token !== "string" || token.length < 20) throw new Error("Invalid token");
  const { payload } = await jwtDecrypt(token, key, {
    issuer: "dorizzstore-web",
    audience: "dorizz-member-community",
  });
  return payload;
}

async function normalizeExpiredMute(memberId) {
  await pool.query(
    `UPDATE member_community_restrictions
       SET status='active', muted_until=NULL, reason=NULL, updated_at=now()
     WHERE member_id=$1::uuid AND status='muted' AND muted_until<=now()`,
    [memberId]
  );
}

async function getMemberState(memberId) {
  await normalizeExpiredMute(memberId);
  const { rows } = await pool.query(
    `SELECT m.id,m.name,m.status,
            COALESCE(r.status,'active') AS community_status,
            r.muted_until,r.reason
       FROM members m
       LEFT JOIN member_community_restrictions r ON r.member_id=m.id
      WHERE m.id=$1::uuid
      LIMIT 1`,
    [memberId]
  );
  return rows[0] || null;
}

async function getAdminState(adminId) {
  const { rows } = await pool.query(
    `SELECT id,name,role,status,permissions
       FROM admin_users
      WHERE id=$1::uuid
      LIMIT 1`,
    [adminId]
  );
  return rows[0] || null;
}

function adminCanManageMembers(admin) {
  if (!admin || admin.status !== "active") return false;
  if (admin.role === "developer" || admin.role === "superadmin") return true;
  const permissions = admin.permissions && typeof admin.permissions === "object" ? admin.permissions : {};
  return permissions.page_members === true;
}

async function assertMemberReadable(memberId) {
  const member = await getMemberState(memberId);
  if (!member || member.status !== "active") {
    return { ok: false, code: "MEMBER_INACTIVE", message: "Member tidak aktif" };
  }
  if (member.community_status === "banned") {
    return { ok: false, code: "COMMUNITY_BANNED", message: "Akses komunitas dibatasi" };
  }
  return { ok: true, member };
}

async function assertMemberWritable(memberId) {
  const state = await assertMemberReadable(memberId);
  if (!state.ok) return state;
  if (state.member.community_status === "muted") {
    return {
      ok: false,
      code: "COMMUNITY_MUTED",
      message: "Kamu sedang di-mute dari komunitas",
      mutedUntil: state.member.muted_until ? new Date(state.member.muted_until).toISOString() : null,
    };
  }
  return state;
}

async function assertAdmin(adminId) {
  const admin = await getAdminState(adminId);
  if (!adminCanManageMembers(admin)) {
    return { ok: false, code: "ADMIN_FORBIDDEN", message: "Akses admin tidak diizinkan" };
  }
  return { ok: true, admin };
}

function allowRate(memberId) {
  const now = Date.now();
  const recent = (rateBuckets.get(memberId) || []).filter((timestamp) => now - timestamp < 10_000);
  if (recent.length >= 5) {
    rateBuckets.set(memberId, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(memberId, recent);
  return true;
}

function serializeMessage(row, adminView = false) {
  const deleted = !!row.deleted_at;
  const replyDeleted = !!row.reply_deleted_at;
  const result = {
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
         m.sender_name_snapshot,m.body,m.reply_to_id,m.created_at,m.deleted_at,
         r.id AS reply_id,r.sender_type AS reply_sender_type,r.sender_name_snapshot AS reply_sender_name,
         r.body AS reply_body,r.deleted_at AS reply_deleted_at
    FROM member_community_messages m
    LEFT JOIN member_community_messages r ON r.id=m.reply_to_id`;

async function fetchMessage(messageId) {
  const { rows } = await pool.query(`${MESSAGE_SELECT} WHERE m.id=$1::uuid LIMIT 1`, [messageId]);
  return rows[0] || null;
}

function parseCursor(cursor) {
  if (!isPlainObject(cursor) || !isUuid(cursor.id) || typeof cursor.createdAt !== "string") return null;
  const date = new Date(cursor.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return { id: cursor.id, createdAt: date.toISOString() };
}

async function listHistory(input, adminView) {
  if (!hasOnlyKeys(input || {}, ["direction", "cursor", "limit"])) {
    return messageError("BAD_PAYLOAD", "Request history tidak valid");
  }
  const direction = input?.direction || "initial";
  if (!["initial", "before", "after"].includes(direction)) {
    return messageError("BAD_PAYLOAD", "Arah history tidak valid");
  }
  const defaultLimit = direction === "after" ? 100 : 50;
  const requested = Number(input?.limit || defaultLimit);
  const limit = Math.max(1, Math.min(direction === "after" ? 100 : 50, Number.isFinite(requested) ? requested : defaultLimit));
  const cursor = direction === "initial" ? null : parseCursor(input?.cursor);
  if (direction !== "initial" && !cursor) return messageError("BAD_CURSOR", "Cursor history tidak valid");

  let result;
  if (direction === "initial") {
    result = await pool.query(`${MESSAGE_SELECT} ORDER BY m.created_at DESC,m.id DESC LIMIT $1`, [limit + 1]);
  } else if (direction === "before") {
    result = await pool.query(
      `${MESSAGE_SELECT}
        WHERE (m.created_at,m.id) < ($1::timestamptz,$2::uuid)
        ORDER BY m.created_at DESC,m.id DESC LIMIT $3`,
      [cursor.createdAt, cursor.id, limit + 1]
    );
  } else {
    result = await pool.query(
      `${MESSAGE_SELECT}
        WHERE (m.created_at,m.id) > ($1::timestamptz,$2::uuid)
        ORDER BY m.created_at ASC,m.id ASC LIMIT $3`,
      [cursor.createdAt, cursor.id, limit + 1]
    );
  }

  const hasMore = result.rows.length > limit;
  let rows = result.rows.slice(0, limit);
  if (direction === "initial" || direction === "before") rows = rows.reverse();
  return { ok: true, messages: rows.map((row) => serializeMessage(row, adminView)), hasMore };
}

async function broadcastMessage(row) {
  io.to("community:members").emit("message:new", serializeMessage(row, false));
  io.to("community:admins").emit("message:new", serializeMessage(row, true));
}

async function createMessage(socket, input) {
  if (!hasOnlyKeys(input || {}, ["clientMessageId", "body", "replyToId"])) {
    return messageError("BAD_PAYLOAD", "Payload pesan tidak valid");
  }
  if (!isUuid(input?.clientMessageId)) return messageError("BAD_CLIENT_ID", "ID pesan tidak valid");
  if (input?.replyToId != null && !isUuid(input.replyToId)) return messageError("BAD_REPLY", "Pesan reply tidak valid");
  if (typeof input?.body !== "string") return messageError("BAD_MESSAGE", "Pesan wajib berupa teks");

  const body = input.body.trim();
  const length = [...body].length;
  if (!length) return messageError("EMPTY_MESSAGE", "Pesan tidak boleh kosong");
  if (length > 2000) return messageError("MESSAGE_TOO_LONG", "Pesan maksimal 2.000 karakter");

  const actor = socket.data.actor;
  if (actor.type === "member") {
    const state = await assertMemberWritable(actor.id);
    if (!state.ok) return messageError(state.code, state.message, { mutedUntil: state.mutedUntil || null });
    if (!allowRate(actor.id)) return messageError("RATE_LIMIT", "Kamu mengirim pesan terlalu cepat");
    actor.name = state.member.name.trim().split(/\s+/)[0] || "Member";
  } else {
    const state = await assertAdmin(actor.id);
    if (!state.ok) return messageError(state.code, state.message);
    actor.name = "DorizzStore";
  }

  if (input.replyToId) {
    const reply = await pool.query(
      `SELECT id FROM member_community_messages WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`,
      [input.replyToId]
    );
    if (!reply.rows[0]) return messageError("REPLY_NOT_FOUND", "Pesan yang dibalas sudah tidak tersedia");
  }

  const inserted = await pool.query(
    `INSERT INTO member_community_messages(
       client_message_id,sender_type,member_id,admin_id,sender_name_snapshot,body,reply_to_id
     ) VALUES(
       $1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::uuid
     ) ON CONFLICT(client_message_id) DO NOTHING
     RETURNING id`,
    [
      input.clientMessageId,
      actor.type,
      actor.type === "member" ? actor.id : null,
      actor.type === "admin" ? actor.id : null,
      actor.name,
      body,
      input.replyToId || null,
    ]
  );

  let messageId = inserted.rows[0]?.id;
  let duplicate = false;
  if (!messageId) {
    duplicate = true;
    const existing = await pool.query(
      `SELECT id,sender_type,member_id,admin_id
         FROM member_community_messages
        WHERE client_message_id=$1::uuid LIMIT 1`,
      [input.clientMessageId]
    );
    const row = existing.rows[0];
    const sameActor = row && row.sender_type === actor.type &&
      (actor.type === "member" ? row.member_id === actor.id : row.admin_id === actor.id);
    if (!sameActor) return messageError("CLIENT_ID_CONFLICT", "ID pesan sudah digunakan");
    messageId = row.id;
  }

  const row = await fetchMessage(messageId);
  if (!row) return messageError("MESSAGE_NOT_FOUND", "Pesan tidak ditemukan setelah disimpan");
  if (!duplicate) await broadcastMessage(row);
  return { ok: true, message: serializeMessage(row, actor.type === "admin"), duplicate };
}

async function writeAdminAudit(adminId, memberId, action, entityType, entityId, reason, details = null) {
  await pool.query(
    `INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason,details)
     VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6,$7::jsonb)`,
    [adminId, memberId || null, action, entityType || null, entityId || null, reason || null, details ? JSON.stringify(details) : null]
  );
}

async function listRestrictions() {
  await pool.query(
    `UPDATE member_community_restrictions
        SET status='active', muted_until=NULL, reason=NULL, updated_at=now()
      WHERE status='muted' AND muted_until<=now()`
  );
  const { rows } = await pool.query(
    `SELECT r.member_id,m.name,r.status,r.muted_until,r.reason,r.updated_at
       FROM member_community_restrictions r
       JOIN members m ON m.id=r.member_id
      WHERE r.status='banned' OR (r.status='muted' AND r.muted_until>now())
      ORDER BY CASE WHEN r.status='banned' THEN 0 ELSE 1 END,r.updated_at DESC
      LIMIT 200`
  );
  return rows.map((row) => ({
    memberId: row.member_id,
    name: row.name,
    status: row.status,
    mutedUntil: row.muted_until ? new Date(row.muted_until).toISOString() : null,
    reason: row.reason || "",
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

async function requireAdminSocket(socket) {
  const actor = socket.data.actor;
  if (!actor || actor.type !== "admin") return { ok: false, response: messageError("ADMIN_ONLY", "Aksi khusus admin") };
  const state = await assertAdmin(actor.id);
  if (!state.ok) return { ok: false, response: messageError(state.code, state.message) };
  actor.name = "DorizzStore";
  return { ok: true, actor };
}

io.use(async (socket, next) => {
  try {
    const payload = await decryptCommunityToken(socket.handshake.auth?.token);
    if (payload.actor === "member" && isUuid(payload.mid)) {
      const state = await assertMemberReadable(payload.mid);
      if (!state.ok) return next(new Error(state.code));
      socket.data.actor = {
        type: "member",
        id: payload.mid,
        name: state.member.name.trim().split(/\s+/)[0] || "Member",
      };
      return next();
    }
    if (payload.actor === "admin" && isUuid(payload.aid)) {
      const state = await assertAdmin(payload.aid);
      if (!state.ok) return next(new Error(state.code));
      socket.data.actor = { type: "admin", id: payload.aid, name: "DorizzStore" };
      return next();
    }
    return next(new Error("INVALID_ACTOR"));
  } catch {
    return next(new Error("UNAUTHORIZED"));
  }
});

io.on("connection", (socket) => {
  const actor = socket.data.actor;
  if (actor.type === "member") {
    socket.join("community:members");
    socket.join(`member:${actor.id}`);
  } else {
    socket.join("community:admins");
  }

  socket.on("history:list", async (input, ack) => {
    try {
      if (actor.type === "member") {
        const state = await assertMemberReadable(actor.id);
        if (!state.ok) return ackSafe(ack, messageError(state.code, state.message));
      } else {
        const state = await assertAdmin(actor.id);
        if (!state.ok) return ackSafe(ack, messageError(state.code, state.message));
      }
      ackSafe(ack, await listHistory(input, actor.type === "admin"));
    } catch (error) {
      console.error("community history error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal memuat riwayat chat"));
    }
  });

  socket.on("message:send", async (input, ack) => {
    try {
      ackSafe(ack, await createMessage(socket, input));
    } catch (error) {
      console.error("community message error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal mengirim pesan"));
    }
  });

  socket.on("message:delete", async (input, ack) => {
    try {
      const admin = await requireAdminSocket(socket);
      if (!admin.ok) return ackSafe(ack, admin.response);
      if (!hasOnlyKeys(input || {}, ["messageId", "reason"]) || !isUuid(input?.messageId)) {
        return ackSafe(ack, messageError("BAD_PAYLOAD", "Pesan tidak valid"));
      }
      const reason = String(input?.reason || "Moderasi komunitas").trim().slice(0, 500) || "Moderasi komunitas";
      const { rows } = await pool.query(
        `UPDATE member_community_messages
            SET deleted_at=now(),deleted_by_admin_id=$2::uuid,delete_reason=$3
          WHERE id=$1::uuid AND deleted_at IS NULL
          RETURNING id,member_id`,
        [input.messageId, admin.actor.id, reason]
      );
      const row = rows[0];
      if (!row) return ackSafe(ack, messageError("MESSAGE_NOT_FOUND", "Pesan tidak ditemukan atau sudah dihapus"));
      await writeAdminAudit(admin.actor.id, row.member_id, "community_message_deleted", "community_message", row.id, reason);
      io.to("community:members").emit("message:deleted", { messageId: row.id });
      io.to("community:admins").emit("message:deleted", { messageId: row.id });
      ackSafe(ack, { ok: true });
    } catch (error) {
      console.error("community delete error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal menghapus pesan"));
    }
  });

  socket.on("member:mute", async (input, ack) => {
    try {
      const admin = await requireAdminSocket(socket);
      if (!admin.ok) return ackSafe(ack, admin.response);
      if (!hasOnlyKeys(input || {}, ["memberId", "durationMinutes", "reason"]) || !isUuid(input?.memberId)) {
        return ackSafe(ack, messageError("BAD_PAYLOAD", "Member tidak valid"));
      }
      const duration = Number(input.durationMinutes);
      if (![60, 1440].includes(duration)) return ackSafe(ack, messageError("BAD_DURATION", "Durasi mute tidak valid"));
      const reason = String(input?.reason || "Moderasi komunitas").trim().slice(0, 500) || "Moderasi komunitas";
      const target = await getMemberState(input.memberId);
      if (!target) return ackSafe(ack, messageError("MEMBER_NOT_FOUND", "Member tidak ditemukan"));
      const { rows } = await pool.query(
        `INSERT INTO member_community_restrictions(member_id,status,muted_until,reason,updated_by_admin_id,updated_at)
         VALUES($1::uuid,'muted',now()+($2::int*interval '1 minute'),$3,$4::uuid,now())
         ON CONFLICT(member_id) DO UPDATE SET status='muted',muted_until=EXCLUDED.muted_until,reason=EXCLUDED.reason,updated_by_admin_id=EXCLUDED.updated_by_admin_id,updated_at=now()
         RETURNING muted_until`,
        [input.memberId, duration, reason, admin.actor.id]
      );
      const mutedUntil = new Date(rows[0].muted_until).toISOString();
      await writeAdminAudit(admin.actor.id, input.memberId, "community_member_muted", "member", input.memberId, reason, { durationMinutes: duration, mutedUntil });
      io.to(`member:${input.memberId}`).emit("restriction:changed", { status: "muted", mutedUntil });
      io.to("community:admins").emit("restriction:changed", { memberId: input.memberId, status: "muted", mutedUntil });
      ackSafe(ack, { ok: true, mutedUntil });
    } catch (error) {
      console.error("community mute error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal mute member"));
    }
  });

  socket.on("member:ban", async (input, ack) => {
    try {
      const admin = await requireAdminSocket(socket);
      if (!admin.ok) return ackSafe(ack, admin.response);
      if (!hasOnlyKeys(input || {}, ["memberId", "reason"]) || !isUuid(input?.memberId)) {
        return ackSafe(ack, messageError("BAD_PAYLOAD", "Member tidak valid"));
      }
      const reason = String(input?.reason || "Moderasi komunitas").trim().slice(0, 500) || "Moderasi komunitas";
      const target = await getMemberState(input.memberId);
      if (!target) return ackSafe(ack, messageError("MEMBER_NOT_FOUND", "Member tidak ditemukan"));
      await pool.query(
        `INSERT INTO member_community_restrictions(member_id,status,muted_until,reason,updated_by_admin_id,updated_at)
         VALUES($1::uuid,'banned',NULL,$2,$3::uuid,now())
         ON CONFLICT(member_id) DO UPDATE SET status='banned',muted_until=NULL,reason=EXCLUDED.reason,updated_by_admin_id=EXCLUDED.updated_by_admin_id,updated_at=now()`,
        [input.memberId, reason, admin.actor.id]
      );
      await writeAdminAudit(admin.actor.id, input.memberId, "community_member_banned", "member", input.memberId, reason);
      io.to(`member:${input.memberId}`).emit("restriction:changed", { status: "banned", mutedUntil: null });
      io.to("community:admins").emit("restriction:changed", { memberId: input.memberId, status: "banned", mutedUntil: null });
      ackSafe(ack, { ok: true });
      setTimeout(() => io.in(`member:${input.memberId}`).disconnectSockets(true), 75);
    } catch (error) {
      console.error("community ban error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal ban member"));
    }
  });

  socket.on("member:unban", async (input, ack) => {
    try {
      const admin = await requireAdminSocket(socket);
      if (!admin.ok) return ackSafe(ack, admin.response);
      if (!hasOnlyKeys(input || {}, ["memberId", "reason"]) || !isUuid(input?.memberId)) {
        return ackSafe(ack, messageError("BAD_PAYLOAD", "Member tidak valid"));
      }
      const reason = String(input?.reason || "Pembatasan komunitas dicabut").trim().slice(0, 500) || "Pembatasan komunitas dicabut";
      const current = await getMemberState(input.memberId);
      if (!current) return ackSafe(ack, messageError("MEMBER_NOT_FOUND", "Member tidak ditemukan"));
      const previousRestriction = current.community_status;
      await pool.query(
        `INSERT INTO member_community_restrictions(member_id,status,muted_until,reason,updated_by_admin_id,updated_at)
         VALUES($1::uuid,'active',NULL,NULL,$2::uuid,now())
         ON CONFLICT(member_id) DO UPDATE SET status='active',muted_until=NULL,reason=NULL,updated_by_admin_id=EXCLUDED.updated_by_admin_id,updated_at=now()`,
        [input.memberId, admin.actor.id]
      );
      const action = previousRestriction === "muted" ? "community_member_unmuted" : "community_member_unbanned";
      await writeAdminAudit(admin.actor.id, input.memberId, action, "member", input.memberId, reason);
      io.to(`member:${input.memberId}`).emit("restriction:changed", { status: "active", mutedUntil: null });
      io.to("community:admins").emit("restriction:changed", { memberId: input.memberId, status: "active", mutedUntil: null });
      ackSafe(ack, { ok: true });
    } catch (error) {
      console.error("community unrestrict error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal membuka pembatasan member"));
    }
  });

  socket.on("restriction:list", async (_input, ack) => {
    try {
      const admin = await requireAdminSocket(socket);
      if (!admin.ok) return ackSafe(ack, admin.response);
      ackSafe(ack, { ok: true, restrictions: await listRestrictions() });
    } catch (error) {
      console.error("community restriction list error", error);
      ackSafe(ack, messageError("SERVER_ERROR", "Gagal memuat pembatasan"));
    }
  });

  const revalidateTimer = setInterval(async () => {
    try {
      if (actor.type === "member") {
        const state = await assertMemberReadable(actor.id);
        if (!state.ok) {
          socket.emit("restriction:changed", { status: state.code === "COMMUNITY_BANNED" ? "banned" : "inactive", mutedUntil: null });
          socket.disconnect(true);
        }
      } else {
        const state = await assertAdmin(actor.id);
        if (!state.ok) socket.disconnect(true);
      }
    } catch {
      // A transient DB issue should not kick everyone out. The next cycle retries.
    }
  }, 60_000);

  socket.on("disconnect", () => clearInterval(revalidateTimer));
});

setInterval(() => {
  const cutoff = Date.now() - 10_000;
  for (const [memberId, timestamps] of rateBuckets.entries()) {
    const recent = timestamps.filter((timestamp) => timestamp >= cutoff);
    if (recent.length) rateBuckets.set(memberId, recent);
    else rateBuckets.delete(memberId);
  }
}, 60_000).unref();

async function shutdown(signal) {
  console.log(`community realtime received ${signal}`);
  io.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Dorizz community realtime listening on :${PORT}`);
});
