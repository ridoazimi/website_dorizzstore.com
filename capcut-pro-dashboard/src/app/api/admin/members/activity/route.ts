import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET() {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(
    `SELECT l.*,a.name admin_name,m.name member_name
     FROM member_admin_activity_log l
     LEFT JOIN admin_users a ON a.id=l.admin_id
     LEFT JOIN members m ON m.id=l.member_id
     ORDER BY l.created_at DESC LIMIT 250`
  ));
}
