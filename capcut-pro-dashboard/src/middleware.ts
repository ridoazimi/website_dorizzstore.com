import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge, verifySalesTokenEdge } from "@/lib/auth-edge";

const PUBLIC_PATHS = [
  "/login", "/register", "/api/auth/login", "/api/auth/register", "/api/auth/me",
  "/api/webhook", "/api/webhook/orderkuota", "/api/cron", "/api/products", "/api/checkout", "/api/referral",
  "/checkout", "/payment", "/terms", "/privacy", "/warranty", "/testimoni", "/r", "/member",
  "/sales-portal/login", "/api/sales-portal/auth/login",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/" || PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) return NextResponse.next();

  // Sales Creator portal tetap menggunakan flow existing dan terpisah dari Member.
  const isSalesPortal = pathname === "/sales-portal" || pathname.startsWith("/sales-portal/") || pathname.startsWith("/api/sales-portal");
  if (isSalesPortal) {
    const token = req.cookies.get("sales_token")?.value;
    if (!token) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return NextResponse.redirect(new URL("/sales-portal/login", req.url));
    }

    const sales = await verifySalesTokenEdge(token);
    if (!sales) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
      const res = NextResponse.redirect(new URL("/sales-portal/login", req.url));
      res.cookies.delete("sales_token");
      return res;
    }
    return NextResponse.next();
  }

  const token = req.cookies.get("admin_token")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const user = await verifyTokenEdge(token);
  if (!user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("admin_token");
    return res;
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
