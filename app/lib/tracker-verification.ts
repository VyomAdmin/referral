"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals, referrers } from "../../db/schema.ts";
import { hashSecureToken } from "./secure-token.ts";
import { verifyTrackerToken, type TrackerTokenKind } from "./tracker-tokens.ts";

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

function cookieNameForToken(kind: TrackerTokenKind, rawToken: string) {
  return `${COOKIE_PREFIX}${kind}_${hashSecureToken(rawToken).slice(0, 16)}`;
}

export async function markTrackerVerified(kind: TrackerTokenKind, rawToken: string) {
  const store = await cookies();
  store.set(cookieNameForToken(kind, rawToken), signToken(hashSecureToken(rawToken)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/track/${kind}/${rawToken}`,
    maxAge: VERIFICATION_TTL_SECONDS,
  });
}

async function getContact(kind: TrackerTokenKind, rawToken: string) {
  const match = await verifyTrackerToken(rawToken, kind);
  const db = getDb();

  if (kind === "referrer") {
    if (!match?.referrerId) return null;
    const [referrer] = await db.select().from(referrers).where(eq(referrers.id, match.referrerId)).limit(1);
    return referrer ? { email: referrer.email, phone: referrer.phone } : null;
  }

  if (!match?.referralId) return null;
  const [referral] = await db.select().from(referrals).where(eq(referrals.id, match.referralId)).limit(1);
  return referral ? { email: referral.customerEmail, phone: referral.customerPhone } : null;
}

export async function isTrackerAccessVerified(kind: TrackerTokenKind, rawToken: string) {
  const store = await cookies();
  const cookie = store.get(cookieNameForToken(kind, rawToken));
  if (!cookie) return false;
  const expected = signToken(hashSecureToken(rawToken));
  if (cookie.value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(cookie.value), Buffer.from(expected));
}

export type TrackerVerifyResult = { ok: true } | { ok: false; error: string };

async function verifyTrackerAccessAction(kind: TrackerTokenKind, rawToken: string, email: string, phone: string): Promise<TrackerVerifyResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const phoneLast4 = phone.replace(/\D/g, "").slice(-4);
  if (!normalizedEmail || phoneLast4.length !== 4) {
    return { ok: false, error: "Enter the email address and the last 4 digits of the phone number on file." };
  }

  const contact = await getContact(kind, rawToken);
  if (!contact) return { ok: false, error: "This tracking link is no longer valid." };

  const emailMatches = contact.email.trim().toLowerCase() === normalizedEmail;
  const phoneMatches = contact.phone.replace(/\D/g, "").slice(-4) === phoneLast4;
  if (!emailMatches || !phoneMatches) {
    return { ok: false, error: "Those details don't match our records. Double-check the email and phone number used at signup." };
  }

  await markTrackerVerified(kind, rawToken);
  return { ok: true };
}

export async function isReferrerAccessVerified(rawToken: string) {
  return isTrackerAccessVerified("referrer", rawToken);
}

export async function verifyReferrerAccessAction(rawToken: string, email: string, phone: string) {
  return verifyTrackerAccessAction("referrer", rawToken, email, phone);
}

export async function isCustomerAccessVerified(rawToken: string) {
  return isTrackerAccessVerified("customer", rawToken);
}

export async function verifyCustomerAccessAction(rawToken: string, email: string, phone: string) {
  return verifyTrackerAccessAction("customer", rawToken, email, phone);
}
