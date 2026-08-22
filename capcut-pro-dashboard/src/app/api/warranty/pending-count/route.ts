import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export async function GET() {
  const auth = await requirePermission("page_warranty");
  if ("error" in auth) return auth.error;

  try {
    const pendingWarrantyClaims = await prisma.warrantyClaim.count({
      where: { status: "pending" },
    });
    return NextResponse.json({ pendingWarrantyClaims });
  } catch (error) {
    console.error("GET /api/warranty/pending-count error:", error);
    return NextResponse.json({ error: "Gagal mengambil jumlah klaim pending" }, { status: 500 });
  }
}
