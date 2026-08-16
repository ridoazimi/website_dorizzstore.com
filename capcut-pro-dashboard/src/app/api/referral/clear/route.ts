import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const requestedPath = req.nextUrl.searchParams.get("redirect") || "/";
  const target = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  const response = NextResponse.redirect(new URL(target, req.url));
  response.cookies.delete("dorizz_referral");
  return response;
}
