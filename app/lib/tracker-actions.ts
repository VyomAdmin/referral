"use server";

import { createTrackerToken, type TrackerTokenKind } from "./tracker-tokens";

export async function mintTrackerLinkAction(kind: TrackerTokenKind) {
  const token = await createTrackerToken({ kind });
  return `/track/${kind}/${token}`;
}
