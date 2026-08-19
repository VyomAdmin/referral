"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrers } from "../../db/schema.ts";
import { hashSecureToken } from "./secure-token.ts";
import { verifyTrackerToken } from "./tracker-tokens.ts";

const COOKIE_PREFIX = "nv_tv_";
const VERIFICATION_TTL_SECONDS = 60 * 60 * 12;

function verificationSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set to verify tracker access.");
  return secret;
}

function signToken(tokenHash: string) {
  return createHmac("sha256", verificationSecret()).update(tokenHash).digest("hex");
}

function cookieNameForToken(rawToken: string) {
  return `${COOKIE_PREFIX}${hashSecureToken(rawToken).slice(0, 16)}`;
}

export async function isReferrerAccessVerified(rawToken: string) {
  const store = await cookies();
  const cookie = store.get(cookieNameForToken(rawToken));
  if (!cookie) return false;
  const expected = signToken(hashSecureToken(rawToken));
  if (cookie.value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(cookie.value), Buffer.from(expected));
}

export type ReferrerVerifyResult = { ok: true } | { ok: false; error: string };

export async function verifyReferrerAccessAction(rawToken: string, email: string, phone: string): Promise<ReferrerVerifyResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const phoneLast4 = phone.replace(/\D/g, "").slice(-4);
  if (!normalizedEmail || phoneLast4.length !== 4) {
    return { ok: false, error: "Enter the email address and the last 4 digits of the phone number used at signup." };
  }

  const match = await verifyTrackerToken(rawToken, "referrer");
  if (!match?.referrerId) return { ok: false, error: "This tracking link is no longer valid." };

  const db = getDb();
  const [referrer] = await db.select().from(referrers).where(eq(referrers.id, match.referrerId)).limit(1);
  if (!referrer) return { ok: false, error: "This tracking link is no longer valid." };

  const emailMatches = referrer.email.trim().toLowerCase() === normalizedEmail;
  const phoneMatches = referrer.phone.replace(/\D/g, "").slice(-4) === phoneLast4;
  if (!emailMatches || !phoneMatches) {
    return { ok: false, error: "Those details don't match our records. Double-check the email and phone number used at signup." };
  }

  const store = await cookies();
  store.set(cookieNameForToken(rawToken), signToken(hashSecureToken(rawToken)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/track/referrer/${rawToken}`,
    maxAge: VERIFICATION_TTL_SECONDS,
  });

  return { ok: true };
}
