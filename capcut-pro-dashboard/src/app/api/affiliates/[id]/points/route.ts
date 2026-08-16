import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("page_affiliates");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const points = Math.trunc(Number(body.points));
    const note = String(body.note || "").trim();
    if (!Number.isInteger(points) || points === 0 || !note) {
      return NextResponse.json({ error: "Jumlah poin dan alasan wajib diisi" }, { status: 400 });
    }

    const entry = await prisma.$transaction(async tx => {
      const member = await tx.affiliate.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      if (points < 0) {
        const available = await tx.affiliatePointLedger.aggregate({
          where: { affiliateId: id, status: "available" },
          _sum: { points: true },
        });
        if (Number(available._sum.points || 0) + points < 0) throw new Error("POINTS_NEGATIVE");
      }
      return tx.affiliatePointLedger.create({
        data: {
          affiliateId: id,
          points,
          type: "manual_adjustment",
          status: "available",
          note,
        },
      });
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "MEMBER_NOT_FOUND") return NextResponse.json({ error: "Member tidak ditemukan" }, { status: 404 });
    if (message === "POINTS_NEGATIVE") return NextResponse.json({ error: "Koreksi akan membuat saldo poin negatif" }, { status: 400 });
    console.error("POST /api/affiliates/[id]/points error:", error);
    return NextResponse.json({ error: "Gagal mengubah poin member" }, { status: 500 });
  }
}
