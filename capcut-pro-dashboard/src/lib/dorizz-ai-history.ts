import "server-only";

import { prisma } from "@/lib/db";

let readyPromise: Promise<void> | null = null;

export type AiHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

export type AiHistoryConversation = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureAiHistoryTables() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ai_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL DEFAULT 'Percakapan Baru',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ai_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ai_messages_role_check CHECK (role IN ('user', 'assistant'))
        )
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ai_conversations_admin_updated_idx ON ai_conversations (admin_id, updated_at DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx ON ai_messages (conversation_id, created_at ASC)`);
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

function cleanTitle(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || "Percakapan Baru").slice(0, 120);
}

export async function createAiConversation(adminId: string, title?: unknown) {
  await ensureAiHistoryTables();
  const rows = await prisma.$queryRawUnsafe<AiHistoryConversation[]>(
    `INSERT INTO ai_conversations (admin_id, title)
     VALUES ($1::uuid, $2)
     RETURNING id, title, created_at AS "createdAt", updated_at AS "updatedAt"`,
    adminId,
    cleanTitle(title),
  );
  return rows[0];
}

export async function listAiConversations(adminId: string) {
  await ensureAiHistoryTables();
  return prisma.$queryRawUnsafe<Array<AiHistoryConversation & { messageCount: number; lastMessage: string | null }>>(
    `SELECT
       c.id,
       c.title,
       c.created_at AS "createdAt",
       c.updated_at AS "updatedAt",
       COUNT(m.id)::int AS "messageCount",
       (
         SELECT m2.content
         FROM ai_messages m2
         WHERE m2.conversation_id = c.id
         ORDER BY m2.created_at DESC, m2.id DESC
         LIMIT 1
       ) AS "lastMessage"
     FROM ai_conversations c
     LEFT JOIN ai_messages m ON m.conversation_id = c.id
     WHERE c.admin_id = $1::uuid
     GROUP BY c.id
     HAVING COUNT(m.id) > 0
     ORDER BY c.updated_at DESC
     LIMIT 60`,
    adminId,
  );
}

export async function getAiConversation(adminId: string, conversationId: string) {
  await ensureAiHistoryTables();
  const conversations = await prisma.$queryRawUnsafe<AiHistoryConversation[]>(
    `SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ai_conversations
     WHERE id = $1::uuid AND admin_id = $2::uuid
     LIMIT 1`,
    conversationId,
    adminId,
  );
  const conversation = conversations[0];
  if (!conversation) return null;

  const messages = await prisma.$queryRawUnsafe<AiHistoryMessage[]>(
    `SELECT id, role, content, created_at AS "createdAt"
     FROM (
       SELECT id, role, content, created_at
       FROM ai_messages
       WHERE conversation_id = $1::uuid
       ORDER BY created_at DESC, id DESC
       LIMIT 300
     ) recent
     ORDER BY created_at ASC, id ASC`,
    conversationId,
  );

  return { conversation, messages };
}

export async function appendAiTurn(
  adminId: string,
  conversationId: string,
  userContent: unknown,
  assistantContent: unknown,
) {
  await ensureAiHistoryTables();
  const userText = String(userContent ?? "").trim().slice(0, 20_000);
  const assistantText = String(assistantContent ?? "").trim().slice(0, 30_000);
  if (!userText || !assistantText) throw new Error("Isi percakapan tidak lengkap.");

  const owned = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM ai_conversations WHERE id = $1::uuid AND admin_id = $2::uuid LIMIT 1`,
    conversationId,
    adminId,
  );
  if (!owned[0]) return false;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO ai_messages (conversation_id, role, content)
       VALUES ($1::uuid, 'user', $2), ($1::uuid, 'assistant', $3)`,
      conversationId,
      userText,
      assistantText,
    );
    await tx.$executeRawUnsafe(
      `UPDATE ai_conversations SET updated_at = now() WHERE id = $1::uuid AND admin_id = $2::uuid`,
      conversationId,
      adminId,
    );
  });
  return true;
}

export async function deleteAiConversation(adminId: string, conversationId: string) {
  await ensureAiHistoryTables();
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM ai_conversations WHERE id = $1::uuid AND admin_id = $2::uuid`,
    conversationId,
    adminId,
  );
  return Number(deleted) > 0;
}
