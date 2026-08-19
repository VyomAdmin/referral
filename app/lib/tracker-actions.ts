"use server";

import { createTrackerToken, type TrackerTokenKind } from "./tracker-tokens.ts";

export async function mintTrackerLinkAction(kind: TrackerTokenKind, ids?: { referrerId?: string; referralId?: string }) {
  const token = await createTrackerToken({ kind, referrerId: ids?.referrerId, referralId: ids?.referralId });
  return `/track/${kind}/${token}`;
}
