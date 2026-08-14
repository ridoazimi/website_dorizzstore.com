import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteAiConversation, getAiConversation } from "@/lib/dorizz-ai-history";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function canUseAi(auth: Awaited<ReturnType<typeof requireAuth>>) {
  if ("error" in auth) return false;
  const permissions = auth.dbUser.permissions as Record<string, boolean> | null;
  return auth.user.role === "developer" || auth.user.role === "superadmin" || permissions?.page_ai === true;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!canUseAi(auth)) return NextResponse.json({ error: "Akses Dorizz AI tidak diizinkan." }, { status: 403 });

  try {
    const { id } = await params;
    const data = await getAiConversation(auth.dbUser.id, id);
    if (!data) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/ai/conversations/[id] error:", error);
    return NextResponse.json({ error: "Gagal membuka percakapan." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!canUseAi(auth)) return NextResponse.json({ error: "Akses Dorizz AI tidak diizinkan." }, { status: 403 });

  try {
    const { id } = await params;
    const deleted = await deleteAiConversation(auth.dbUser.id, id);
    if (!deleted) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/ai/conversations/[id] error:", error);
    return NextResponse.json({ error: "Gagal menghapus percakapan." }, { status: 500 });
  }
}
