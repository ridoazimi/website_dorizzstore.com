import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { randomBytes } from "crypto";

// POST /api/affiliates/[id]/invite — Generate invite link
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("page_affiliates");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;

    const affiliate = await prisma.affiliate.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, password: true, inviteToken: true },
    });

    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate tidak ditemukan" }, { status: 404 });
    }

    // Generate or reuse existing invite token
    let inviteToken = affiliate.inviteToken;
    if (!inviteToken) {
      inviteToken = randomBytes(32).toString("hex");
      await prisma.affiliate.update({
        where: { id },
        data: { inviteToken },
      });
    }

    // Build invite URL
    const baseUrl = req.headers.get("origin") || process.env.NEXT_PUBLIC_BASE_URL || "https://doriz.store";
    const setupUrl = `${baseUrl}/affiliate/setup?token=${inviteToken}`;
    const referralUrl = `${baseUrl}/r/${inviteToken}`;

    return NextResponse.json({
      success: true,
      // inviteUrl remains the setup URL for backwards compatibility.
      inviteUrl: setupUrl,
      setupUrl,
      referralUrl,
      inviteToken,
      affiliateName: affiliate.name,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
