import { hmacHex } from "./crypto";
import { safeEqual } from "../http";

export interface ReviewClaims {
  id: string;
  donationId: string;
  expiresAt: string;
}
export async function signReviewToken(claims: ReviewClaims, secret: string): Promise<string> {
  const payload = btoa(JSON.stringify({ v: 1, purpose: "support_review", ...claims }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${payload}.${await hmacHex(secret, payload)}`;
}
export async function verifyReviewToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<ReviewClaims | null> {
  try {
    const [payload, signature, extra] = token.split(".");
    if (
      !payload ||
      !signature ||
      extra ||
      !secret ||
      !(await safeEqual(signature, await hmacHex(secret, payload)))
    )
      return null;
    const claims = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))) as Record<
      string,
      unknown
    >;
    if (
      claims.v !== 1 ||
      claims.purpose !== "support_review" ||
      typeof claims.id !== "string" ||
      typeof claims.donationId !== "string" ||
      typeof claims.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(claims.expiresAt)) ||
      Date.parse(claims.expiresAt) <= now
    )
      return null;
    return { id: claims.id, donationId: claims.donationId, expiresAt: claims.expiresAt };
  } catch {
    return null;
  }
}
