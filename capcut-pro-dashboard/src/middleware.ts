import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge, verifyAffiliateTokenEdge, verifySalesTokenEdge } from "@/lib/auth-edge";

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/me",
  "/api/webhook",
  "/api/webhook/orderkuota",
  "/api/cron",
  "/api/products",
  "/api/checkout",
  "/api/referral",
  "/checkout",
  "/payment",
  "/terms",
  "/privacy",
  "/warranty",
  "/testimoni",
  "/r",
  // Affiliate public paths


  "/affiliate/login",
  "/affiliate/setup",
  "/api/affiliate-portal/auth/login",
  "/api/affiliate-portal/auth/setup",
  // Sales portal public paths
  "/sales-portal/login",
  "/api/sales-portal/auth/login",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow exact root path
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── Affiliate Portal Routes ──────────────────────────────────────────────
  // IMPORTANT: Must NOT match /affiliates (admin page). Only match:
  //   /affiliate (exact), /affiliate/*, /api/affiliate-portal/*
  const isAffiliatePortal = pathname === "/affiliate" || pathname.startsWith("/affiliate/") || pathname.startsWith("/api/affiliate-portal");
  if (isAffiliatePortal) {
    const token = req.cookies.get("affiliate_token")?.value;

    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/affiliate/login", req.url));
    }

    const affiliate = await verifyAffiliateTokenEdge(token);
    if (!affiliate) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
      }
      const res = NextResponse.redirect(new URL("/affiliate/login", req.url));
      res.cookies.delete("affiliate_token");
      return res;
    }

    return NextResponse.next();
  }

  // ── Sales Portal Routes ──────────────────────────────────────────────────
  // Match: /sales-portal (exact), /sales-portal/*, /api/sales-portal/*
  const isSalesPortal = pathname === "/sales-portal" || pathname.startsWith("/sales-portal/") || pathname.startsWith("/api/sales-portal");
  if (isSalesPortal) {
    const token = req.cookies.get("sales_token")?.value;

    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/sales-portal/login", req.url));
    }

    const sales = await verifySalesTokenEdge(token);
    if (!sales) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
      }
      const res = NextResponse.redirect(new URL("/sales-portal/login", req.url));
      res.cookies.delete("sales_token");
      return res;
    }

    return NextResponse.next();
  }

  // ── Admin Routes (existing behavior) ─────────────────────────────────────
  const token = req.cookies.get("admin_token")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const user = await verifyTokenEdge(token);
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("admin_token");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
