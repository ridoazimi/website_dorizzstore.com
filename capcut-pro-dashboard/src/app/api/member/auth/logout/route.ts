import { NextResponse } from "next/server";
import { clearMemberCookie } from "@/lib/member";

export async function POST() {
  await clearMemberCookie();
  return NextResponse.json({ success: true });
}
