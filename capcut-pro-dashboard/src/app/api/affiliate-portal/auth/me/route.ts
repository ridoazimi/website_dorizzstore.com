import { NextResponse } from "next/server";
import { getAffiliateUser, clearAffiliateCookie } from "@/lib/affiliate-auth";
import { prisma } from "@/lib/db";
import { getPointSummary } from "@/lib/loyalty-points";

export async function GET() {
  try {
    const affiliate = await getAffiliateUser();
    if (!affiliate) return NextResponse.json({ member: null, affiliate: null }, { status: 401 });

    const dbAffiliate = await prisma.affiliate.findUnique({
      where: { id: affiliate.id },
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        inviteToken: true,
        status: true,
      },
    });

    if (!dbAffiliate || dbAffiliate.status !== "active") {
      return NextResponse.json({ member: null, affiliate: null }, { status: 401 });
    }

    const points = await getPointSummary(dbAffiliate.id, prisma);
    const member = { ...dbAffiliate, ...points };
    return NextResponse.json({ member, affiliate: member });
  } catch (error) {
    console.error("GET /api/affiliate-portal/auth/me error:", error);
    return NextResponse.json({ error: "Gagal memuat sesi member" }, { status: 500 });
  }
}

export async function POST() {
  await clearAffiliateCookie();
  return NextResponse.json({ success: true });
}
