import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET() {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const [rewards, products] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT r.*,p.name product_name,(SELECT COUNT(*) FROM member_redemptions x WHERE x.reward_id=r.id)::int redemption_count FROM member_rewards r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.is_active DESC,r.points_required ASC`),
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ rewards, products });
}

export async function POST(req: Request) {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const { name, description, pointsRequired, fulfillmentType, productId, fulfillmentNotes } = await req.json();
  if (!name || Number(pointsRequired) <= 0) return NextResponse.json({ error: "Nama dan kebutuhan poin wajib valid" }, { status: 400 });
  if (fulfillmentType === "dorizz_voucher" && !productId) return NextResponse.json({ error: "Produk tujuan wajib dipilih untuk voucher Dorizz" }, { status: 400 });
  const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO member_rewards(name,description,points_required,fulfillment_type,product_id,fulfillment_notes) VALUES($1,$2,$3,$4,$5::uuid,$6) RETURNING id`, name, description || null, Number(pointsRequired), fulfillmentType || "manual", productId || null, fulfillmentNotes || null);
  await prisma.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,action,entity_type,entity_id,details) VALUES($1::uuid,'reward_created','reward',$2::uuid,$3::jsonb)`, a.user.id, rows[0].id, JSON.stringify({ name, pointsRequired, fulfillmentType, productId }));
  return NextResponse.json({ success: true, id: rows[0].id });
}

export async function PATCH(req: Request) {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const { id, isActive, reason } = await req.json();
  if (!id || typeof isActive !== "boolean" || !String(reason || "").trim()) return NextResponse.json({ error: "Reward, status, dan alasan wajib diisi" }, { status: 400 });
  const changed = await prisma.$queryRawUnsafe<any[]>(`UPDATE member_rewards SET is_active=$2,updated_at=now() WHERE id=$1::uuid RETURNING id,name`, id, isActive);
  if (!changed[0]) return NextResponse.json({ error: "Reward tidak ditemukan" }, { status: 404 });
  await prisma.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,action,entity_type,entity_id,reason,details) VALUES($1::uuid,'reward_status_changed','reward',$2::uuid,$3,$4::jsonb)`, a.user.id, id, reason, JSON.stringify({ isActive }));
  return NextResponse.json({ success: true });
}
