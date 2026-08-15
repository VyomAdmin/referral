import { randomBytes, createHash } from "node:crypto";

export function generateSecureToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSecureToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function secureTokenExpiry(ttlDays: number, from = new Date()) {
  return new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
