// Deliberately NOT in admin-dashboard.tsx: that file is "use client", and a
// server component importing a value from it gets a client reference rather
// than the array itself — `.includes` on that reference throws, which 500s
// every /admin/<section> route. Kept here so both the client nav and the
// server-side route validation read the same list.
export const ADMIN_SECTIONS = [
  "overview",
  "referrals",
  "campaigns",
  "templates",
  "rewards",
  "emails",
  "analytics",
  "integrations",
  "settings",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];
