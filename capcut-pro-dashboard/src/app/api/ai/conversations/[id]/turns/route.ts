import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { appendAiTurn } from "@/lib/dorizz-ai-history";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function canUseAi(auth: Awaited<ReturnType<typeof requireAuth>>) {
  if ("error" in auth) return false;
  const permissions = auth.dbUser.permissions as Record<string, boolean> | null;
  return auth.user.role === "developer" || auth.user.role === "superadmin" || permissions?.page_ai === true;
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!canUseAi(auth)) return NextResponse.json({ error: "Akses Dorizz AI tidak diizinkan." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const saved = await appendAiTurn(auth.dbUser.id, id, body?.user, body?.assistant);
    if (!saved) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/ai/conversations/[id]/turns error:", error);
    return NextResponse.json({ error: "Gagal menyimpan riwayat percakapan." }, { status: 500 });
  }
}
