import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { EncryptJWT } from "jose";

const COMMUNITY_ISSUER = "dorizzstore-web";
const COMMUNITY_AUDIENCE = "dorizz-member-community";
const COMMUNITY_TOKEN_TTL = "15m";

function communityKey() {
  const secret = process.env.COMMUNITY_JWT_SECRET;
  if (!secret) throw new Error("COMMUNITY_JWT_SECRET is not configured");
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

function normalizeSocketUrl(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\/$/, "");
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getCommunitySocketUrl(requestOrigin?: string) {
  return normalizeSocketUrl(process.env.COMMUNITY_SOCKET_URL) || normalizeSocketUrl(requestOrigin);
}

export async function signCommunityToken(input:
  | { actor: "member"; memberId: string; name: string }
  | { actor: "admin"; adminId: string; name: string }
) {
  const payload = input.actor === "member"
    ? { actor: input.actor, mid: input.memberId, name: input.name }
    : { actor: input.actor, aid: input.adminId, name: input.name };

  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(COMMUNITY_ISSUER)
    .setAudience(COMMUNITY_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(COMMUNITY_TOKEN_TTL)
    .encrypt(communityKey());
}
