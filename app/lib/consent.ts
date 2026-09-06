// The consent wording, in one place, so the text stored against a referrer is
// byte-for-byte the text that was on screen when they ticked the box. The UI
// renders this same string with {terms}/{privacy} swapped for links, so the
// rendered copy and the stored record cannot drift apart.
//
// Bump REFERRER_CONSENT_VERSION whenever the wording changes. Old rows keep
// their original text, which is the point: "they agreed to whatever the page
// says today" is not a defensible record.

export const REFERRER_CONSENT_VERSION = "2026-09-06";

export const REFERRER_CONSENT_TEMPLATE =
  "I have read and agree to the {terms} and {privacy}. I confirm I am 18 or older, " +
  "that I will only refer people who have given me permission to share their details, " +
  "and I consent to receive emails and text messages from NuVision Auto Glass about my " +
  "referrals. Message and data rates may apply; message frequency varies. Reply STOP to opt out.";

export const CONSENT_LINK_LABELS = { terms: "Referral Program Terms", privacy: "Privacy Policy" } as const;

// The plain-text rendering that gets persisted alongside the tick.
export function referrerConsentText(): string {
  return REFERRER_CONSENT_TEMPLATE.replace("{terms}", CONSENT_LINK_LABELS.terms).replace("{privacy}", CONSENT_LINK_LABELS.privacy);
}

// Splits the template into literal segments and link slots so the component can
// render it without restating the wording.
export type ConsentSegment = { type: "text"; value: string } | { type: "link"; slot: "terms" | "privacy"; label: string };

export function referrerConsentSegments(): ConsentSegment[] {
  const segments: ConsentSegment[] = [];
  const pattern = /\{(terms|privacy)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(REFERRER_CONSENT_TEMPLATE))) {
    if (match.index > lastIndex) segments.push({ type: "text", value: REFERRER_CONSENT_TEMPLATE.slice(lastIndex, match.index) });
    const slot = match[1] as "terms" | "privacy";
    segments.push({ type: "link", slot, label: CONSENT_LINK_LABELS[slot] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < REFERRER_CONSENT_TEMPLATE.length) segments.push({ type: "text", value: REFERRER_CONSENT_TEMPLATE.slice(lastIndex) });
  return segments;
}
