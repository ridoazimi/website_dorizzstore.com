import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createAiConversation, listAiConversations } from "@/lib/dorizz-ai-history";

export const dynamic = "force-dynamic";

function canUseAi(auth: Awaited<ReturnType<typeof requireAuth>>) {
  if ("error" in auth) return false;
  const permissions = auth.dbUser.permissions as Record<string, boolean> | null;
  return auth.user.role === "developer" || auth.user.role === "superadmin" || permissions?.page_ai === true;
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!canUseAi(auth)) return NextResponse.json({ error: "Akses Dorizz AI tidak diizinkan." }, { status: 403 });

  try {
    const conversations = await listAiConversations(auth.dbUser.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("GET /api/ai/conversations error:", error);
    return NextResponse.json({ error: "Gagal mengambil riwayat percakapan." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!canUseAi(auth)) return NextResponse.json({ error: "Akses Dorizz AI tidak diizinkan." }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const conversation = await createAiConversation(auth.dbUser.id, body?.title);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ai/conversations error:", error);
    return NextResponse.json({ error: "Gagal membuat percakapan baru." }, { status: 500 });
  }
}
