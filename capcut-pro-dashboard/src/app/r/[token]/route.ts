import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const code = token.trim().toUpperCase();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM members WHERE referral_code=$1 AND status='active' LIMIT 1`, code
  );
  const target = new URL("/", req.url);
  if (!rows[0]) {
    target.searchParams.set("ref_error", "invalid");
    return NextResponse.redirect(target);
  }

  // Last click: every valid Member referral replaces the previous cookie.
  const response = NextResponse.redirect(target);
  response.cookies.set("dorizz_referral", code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
