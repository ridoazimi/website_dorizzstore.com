import { NextResponse } from "next/server";
import { requireMemberAdmin } from "@/lib/member-admin-auth";
import { getCommunitySocketUrl, signCommunityToken } from "@/lib/member-community";

export async function POST(request: Request) {
  try {
    const auth = await requireMemberAdmin();
    if ("error" in auth) return auth.error;

    const socketUrl = getCommunitySocketUrl(new URL(request.url).origin);
    if (!socketUrl) {
      return NextResponse.json({ error: "Layanan komunitas belum dikonfigurasi" }, { status: 503 });
    }

    const token = await signCommunityToken({
      actor: "admin",
      adminId: auth.user.id,
      name: auth.user.name || "Admin DorizzStore",
    });

    return NextResponse.json(
      { token, socketUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin community token error", error);
    return NextResponse.json({ error: "Gagal membuka komunitas" }, { status: 500 });
  }
}
