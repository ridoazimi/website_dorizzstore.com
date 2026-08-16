import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await prisma.affiliate.findFirst({
    where: { inviteToken: token, status: "active" },
    select: { id: true },
  });

  const target = new URL("/", req.url);
  if (!member) {
    target.searchParams.set("ref_error", "invalid");
    return NextResponse.redirect(target);
  }

  const response = NextResponse.redirect(target);
  response.cookies.set("dorizz_referral", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
