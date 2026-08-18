import "server-only";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function requireMemberAdmin() {
  const result = await requireAuth();
  if ("error" in result) return result;

  const { user, dbUser } = result;
  if (user.role === "developer" || user.role === "superadmin") return { user };

  const permissions = dbUser.permissions as Record<string, boolean> | null;
  if (permissions?.page_members === true) return { user };

  return {
    error: NextResponse.json({ error: "Akses Member tidak diizinkan" }, { status: 403 }),
  };
}
