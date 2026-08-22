import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember } from "@/lib/member";
import { getCommunitySocketUrl, signCommunityToken } from "@/lib/member-community";

export async function POST() {
  try {
    const session = await getMember();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const members = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; status: string }>>(
      `SELECT id,name,status FROM members WHERE id=$1::uuid LIMIT 1`,
      session.id
    );
    const member = members[0];
    if (!member || member.status !== "active") {
      return NextResponse.json({ error: "Member tidak aktif" }, { status: 403 });
    }

    const restrictions = await prisma.$queryRawUnsafe<Array<{ status: string; muted_until: Date | null }>>(
      `SELECT status,muted_until FROM member_community_restrictions WHERE member_id=$1::uuid LIMIT 1`,
      member.id
    );
    const restriction = restrictions[0];
    if (restriction?.status === "banned") {
      return NextResponse.json({ error: "Akses komunitas kamu dibatasi" }, { status: 403 });
    }

    const socketUrl = getCommunitySocketUrl();
    if (!socketUrl) {
      return NextResponse.json({ error: "Layanan komunitas belum dikonfigurasi" }, { status: 503 });
    }

    const displayName = member.name.trim().split(/\s+/)[0] || "Member";
    const token = await signCommunityToken({ actor: "member", memberId: member.id, name: displayName });
    const mutedUntil = restriction?.status === "muted" && restriction.muted_until && restriction.muted_until > new Date()
      ? restriction.muted_until.toISOString()
      : null;

    return NextResponse.json(
      { token, socketUrl, restriction: mutedUntil ? { status: "muted", mutedUntil } : { status: "active", mutedUntil: null } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Member community token error", error);
    return NextResponse.json({ error: "Gagal membuka komunitas" }, { status: 500 });
  }
}
