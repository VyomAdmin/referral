# Analysis

Source reviewed: commit `0309f55` (2026-09-26), message "Disarm the cleanup after removing the Sep4/TwoSeven rows". This is a reading of the tree. It does not confirm that any environment is deployed or that any integration is live.

## Stack and framework

The running app is a [vinext](https://github.com/cloudflare/vinext) 1.0.0-beta.2 project (`package.json`). Vinext serves a Next.js-style App Router under `app/` with React 19 server components, server actions (`"use server"`), and route handlers. Vite 8 builds it (`vite.config.ts`). Styling is Tailwind CSS v4 (`app/globals.css`, `postcss.config.mjs`).

Data is PostgreSQL through Drizzle ORM (`db/schema.ts`, `db/index.ts`, `drizzle/`, `drizzle.config.ts`). The driver is `pg`. `DATABASE_URL` is the connection string. Tests can use `@electric-sql/pglite`. Migrations `0000` through `0012` are generated SQL and are already in the tree.

Staff sign-in is next-auth v5 beta with a credentials provider (`app/lib/auth.ts`). Passwords are bcrypt hashes. Optional authenticator-app codes use `otplib` (`app/lib/totp.ts`). `middleware.ts` redirects unsigned `/admin` requests to `/admin/login`, except invite acceptance.

Email goes out through Brevo's HTTP API, with a Gmail SMTP fallback via `nodemailer` (`app/lib/brevo.ts`, `app/lib/email-sender.ts`). SMS goes out through Twilio (`app/lib/sms-sender.ts`). The CRM client talks to HubSpot (`app/lib/hubspot-client.ts`, `app/lib/hubspot-sync.ts`).

`README.md` still describes a generic vinext starter and says `db/schema.ts` is empty. That is not true of this commit. `TEST_MODE.md` and `AGENT_HANDOFF.md` describe browser-only submissions and seeded records. The server actions write to PostgreSQL.

Hosting files in the tree target AWS App Runner (`apprunner.yaml`, `Dockerfile`, `deploy/`, `scripts/start.sh`). This analysis did not call or inspect any deployed service.

## Data flow

### Referrer signup

`app/page.tsx` renders `ReferrerRegistration`. The form posts to `submitReferrerRegistrationAction` (`app/lib/referrer-actions.ts`).

The action trims the name, lowercases the email, checks email and phone shape, and requires the consent checkbox. It rate-limits by client IP (5 attempts / 10 minutes, `app/lib/rate-limit.ts`). It loads or inserts one organization row (`app/lib/organization.ts`). If the email already exists, it returns that person's code. Otherwise it inserts `referrers` with the consent text, time, and IP (`app/lib/consent.ts`), mints a hashed tracker link (`app/lib/tracker-actions.ts`), then fires two side effects that are not allowed to fail the signup: a welcome email/SMS (`app/lib/referrer-notifications.ts`) and a HubSpot contact sync (`syncReferrerToHubSpot`).

The code shown after signup is shared by copy, text, email, and WhatsApp from the client component.

### Referred-customer quote

`/r/[code]` renders `ReferralJourney` (`app/components/referral-journey.tsx`). The customer enters a ZIP. `campaignForZip` (`app/lib/referral-rules.ts`) keeps the ZIP only when its first three digits are in `serviceableZips.json` and the numeric prefix falls in 850–865 or 320–349. Those two ranges are hard-coded to two campaign objects, Arizona and Florida. A serviceable prefix outside both ranges returns null. The file `serviceableZips.json` also contains prefixes 290–299. Those prefixes pass the file check and then match neither campaign.

An uncovered ZIP can be logged by `recordNonServiceableZipAction` (`app/lib/service-area-actions.ts`) into `non_serviceable_zip_attempts`. The insert is best-effort.

`submitCustomerReferralAction` (`app/lib/referral-actions.ts`) recomputes the campaign from the ZIP, checks consent, vehicle year, and rate limit, loads the referrer by code, and rejects a self-referral when email or phone digits match (`isSelfReferral`). It inserts `referrals` with `publicStatus: "received"` and the campaign state. It mints a customer tracker link, syncs a HubSpot contact and deal, and sends referrer and customer notifications. HubSpot failure is recorded on the row (`syncStatus`, `hubspotSyncError`) and does not fail the quote.

### Tracking

`/track` asks for an email and phone (`app/components/tracker-lookup.tsx`, `app/lib/tracker-verification.ts`) before showing referrer data. Referrer totals include completed installations and paid rewards (`app/lib/tracker-data.ts`). Customer tracking uses a separate token route, `/track/customer/[token]`. Customer views are not given the referrer's reward status. The split is in the tracker data helpers and the customer page.

### Reward

A reward is not created by Closed Won. `mapHubSpotDealToPublicStatus` (`app/lib/hubspot.ts`) treats a stage label matching appointment, scheduled, or closed won as `scheduled`. Status becomes `installed` only when an installation-completed flag and timestamp are both set. The webhook path looks for HubSpot property `status_code__c` equal to `Install Completed` (`app/lib/hubspot-sync.ts`).

`markReferralPaidAction` (`app/lib/admin-actions.ts`) refuses to mark paid unless `publicStatus` is `installed` and `installationCompletedAt` is set. It records who marked it and when. No payment provider is called. `rewards.paymentMethod` exists on the schema, and the Arizona campaign copy names ACH, PayPal, and Venmo (`app/lib/referral-rules.ts`).

### Staff portal

`/admin` sections are overview, referrals, campaigns, templates, rewards, emails, analytics, integrations, and settings (`app/lib/admin-sections.ts`). Data is loaded in server components from PostgreSQL (`app/lib/admin-queries.ts`) and rendered by `app/components/admin-dashboard.tsx`.

Sign-in checks the password and, when `totpEnabled` is set, an authenticator code (`app/lib/auth.ts`). Invites insert a `team_members` row and return a URL (`app/lib/invite-actions.ts`). The action does not send email.

`updateCampaignAction` checks that a session exists. It does not check `MARKETING_ROLES`. Any signed-in staff role can edit a campaign.

Roles in code today are `owner`, `Company admin`, `CRM Operations`, `Rewards & Finance`, and `Marketing` (`app/lib/roles.ts`). Marking a reward paid is limited to `REWARD_ROLES`.

Audit rows go to `audit_events` (`app/lib/audit.ts`).

### HubSpot

`app/lib/hubspot-client.ts` creates and updates contacts and deals and reads deal properties. `app/lib/hubspot-sync.ts` maps deal events onto referral status and retries failed syncs. `app/api/webhooks/hubspot/route.ts` reads the raw body, checks an HMAC v3 signature with `HUBSPOT_CLIENT_SECRET`, returns 503 when that secret is unset, stores `webhook_events` for idempotency, and applies the event. A reconciliation path re-reads the deal from HubSpot.

### Email and SMS

`app/lib/email-sender.ts` prefers Brevo and falls back to SMTP. `app/api/webhooks/brevo/route.ts` records delivery events when `BREVO_WEBHOOK_TOKEN` is set. Templates live in code (`app/lib/email-templates.ts`, `app/lib/sms-templates.ts`) and in `campaign_email_templates` / `campaign_sms_templates`. The admin emails section reads `email_events`.

### What the staff and public clients can touch

Public pages call server actions. Those actions write PostgreSQL directly. There is no separate functions tier and no security-rules database. The browser does not hold database credentials. Admin reads also happen on the server, inside the signed-in session.

## Gaps visible in this tree

- Campaign edit is gated on any staff session, not on a marketing role (`updateCampaignAction`).
- Invites are not emailed. The action returns `inviteUrl`.
- Public forms have a rate limit. They do not have a bot check.
- Marking a reward paid stores a person and a time. It does not send money.
- Sign-in is email and password plus optional TOTP. There is no SSO.
- Analytics in the admin UI are counts derived from referral rows, not a separate warehouse.

## Brand, market, and vendor inventory

The search terms were `nuvision`, `arizona`, `AZ` as a state code (not as part of a longer word), `hubspot`, `postgres`, `brevo`, `twilio`, and `smtp`, case-insensitive. `serviceableZips.json` has no text match on those terms. It is still the Arizona / Florida / South Carolina prefix list: lines 4–12 are prefixes 290–299, lines 13–39 are Florida prefixes, and lines 40–51 are Arizona prefixes (850, 852, 853, 855–857, 859, 860, 863–865).

Filenames that match:

- `app/lib/brevo.ts`
- `app/lib/hubspot.ts`
- `app/lib/hubspot-sync.ts`
- `app/lib/hubspot-client.ts`
- `app/api/webhooks/brevo/route.ts`
- `app/api/webhooks/hubspot/route.ts`
- `tests/hubspot.test.ts`
- `tests/hubspot-client.test.ts`
- `tests/brevo.test.ts`
- `tests/hubspot-sync.test.ts`
- `tests/hubspot-properties.test.ts`
- `tests/fixtures/hubspot-properties.json`
- `scripts/verify-hubspot-picklists.mjs`
- `public/nuvision-wordmark.png`
- `public/nuvision-wordmark-color.png`

The table below lists every matching line in the commit. Drizzle snapshots repeat the same HubSpot column names once per migration.

## Line inventory

Generated from the tree at commit 0309f55. Each row is a matching line or a matching filename. Binary images are listed when the filename matches.

| File | Terms | Line |
| --- | --- | --- |
| `package-lock.json` | postgres | 5050: "@vercel/postgres": ">=0.8.0", |
| `package-lock.json` | postgres | 5060: "postgres": ">=3", |
| `package-lock.json` | postgres | 5110: "@vercel/postgres": { |
| `package-lock.json` | postgres | 5140: "postgres": { |
| `package-lock.json` | postgres | 7806: "postgres-array": "~2.0.0", |
| `package-lock.json` | postgres | 7807: "postgres-bytea": "~1.0.0", |
| `package-lock.json` | postgres | 7808: "postgres-date": "~1.0.4", |
| `package-lock.json` | postgres | 7809: "postgres-interval": "^1.1.0" |
| `package-lock.json` | postgres | 7895: "node_modules/postgres-array": { |
| `package-lock.json` | postgres | 7897: "resolved": "https://registry.npmjs.org/postgres-array/-/postgres-array-2.0.0.tgz", |
| `package-lock.json` | postgres | 7904: "node_modules/postgres-bytea": { |
| `package-lock.json` | postgres | 7906: "resolved": "https://registry.npmjs.org/postgres-bytea/-/postgres-bytea-1.0.1.tgz", |
| `package-lock.json` | postgres | 7913: "node_modules/postgres-date": { |
| `package-lock.json` | postgres | 7915: "resolved": "https://registry.npmjs.org/postgres-date/-/postgres-date-1.0.7.tgz", |
| `package-lock.json` | postgres | 7922: "node_modules/postgres-interval": { |
| `package-lock.json` | postgres | 7924: "resolved": "https://registry.npmjs.org/postgres-interval/-/postgres-interval-1.2.0.tgz", |
| `AWS_HOSTING_REQUEST.md` | nuvision | 1: # AWS Access Request — NuVision Referral Platform |
| `AWS_HOSTING_REQUEST.md` | nuvision | 26: 5. **Target subdomain** (e.g. `referrals.nuvisionautoglass.com`) — needed to confirm it's under a Route 53 zone he controls, or to create one. |
| `AWS_HOSTING_REQUEST.md` | hubspot | 36: - Production HubSpot or email provider credentials — those are handled separately once the app is off test mode. |
| `referral-cutover-session-log.md` | nuvision | 1: # NuVision Referral Cutover — Session Log |
| `referral-cutover-session-log.md` | hubspot | 6: **Method:** live browser testing + HubSpot API reads. Read-only — no data was written to any live system. |
| `referral-cutover-session-log.md` | nuvision | 13: NuVision runs its referral program on **Referral Factory**, with two separate campaigns: |
| `referral-cutover-session-log.md` | nuvision, arizona | 17: \| Arizona \| `https://nuvision-auto-glass.referral-factory.com/7ztxOB` \| |
| `referral-cutover-session-log.md` | nuvision | 18: \| Florida \| `https://nuvision-auto-glass.referral-factory.com/cPXcHGVa` \| |
| `referral-cutover-session-log.md` | nuvision, AZ state code | 22: - `https://www.nuvisionautoglass.com/referral-program-faq/` (AZ) |
| `referral-cutover-session-log.md` | nuvision | 23: - `https://www.nuvisionautoglass.com/referral-program-faq-florida/` (FL) |
| `referral-cutover-session-log.md` | nuvision, hubspot | 25: A new in-house app is replacing it: **`https://referrals.nuvisionautoglass.com`**. One link for both states, state chosen by the referred friend's ZIP. Data ... |
| `referral-cutover-session-log.md` | arizona | 31: \| Arizona \| $50 — vouchers (Amazon / Walmart / Target / Starbucks) **or** bank transfer (ACH / PayPal / Venmo) \| $50 extra cash back with insurance, or $5... |
| `referral-cutover-session-log.md` | hubspot | 48: \| **B‑03** \| Referrer never reaches HubSpot \| `referral_code__c`, `referralcode`, `referred_by`, `referral_email__c`, `referral_phone__c` all empty. No re... |
| `referral-cutover-session-log.md` | arizona | 59: - ZIP hardened — `required`, `pattern=\d{5}`, min and max length 5. `8500199999` no longer routes to Arizona |
| `referral-cutover-session-log.md` | arizona | 69: - Dev helper text "Try 85001 for Arizona or 33101 for Florida." removed |
| `referral-cutover-session-log.md` | brevo, smtp | 71: - Email moved from **Gmail SMTP app password → Brevo (API) with delivery webhooks** |
| `referral-cutover-session-log.md` | hubspot | 77: - Test data cleared from live HubSpot |
| `referral-cutover-session-log.md` | arizona | 84: Ran a live referrer signup and an Arizona referral on 7 September. |
| `referral-cutover-session-log.md` | nuvision | 88: \| Sender \| `referral@nuvisionautoglass.com`, **signed-by nuvisionautoglass.com** — DKIM aligned \| |
| `referral-cutover-session-log.md` | AZ state code | 91: \| Referee confirmation \| "Your referral benefit: $50 additional cash back with insurance or $50 off a cash payment." — matches the AZ campaign exactly \| |
| `referral-cutover-session-log.md` | AZ state code | 118: \| AZ 74% + FL 33% \| should total 15 installs \| AZ 14/19 + FL 1/3 = 15 \| Pass \| |
| `referral-cutover-session-log.md` | nuvision, hubspot | 122: **D‑01:** the tile almost certainly counts referrals, not referrers — it matches "Referral forms 22" exactly. The 14 distinct referrer emails are: `wonka@nv.... |
| `referral-cutover-session-log.md` | brevo | 137: The 19 include Google Ads / DoubleClick, Facebook, **Microsoft Clarity**, Bing, Brevo and Zoho SalesIQ chat. |
| `referral-cutover-session-log.md` | nuvision | 139: Two problems: the referral page was the fastest thing NuVision owns and is now slower than the main quote page; and Clarity records sessions on a page that c... |
| `referral-cutover-session-log.md` | nuvision | 141: **Fix:** in GTM, scope the ad and session-recording tags to `www.nuvisionautoglass.com` only. Let the subdomain load GA4 plus the three referral events, noth... |
| `referral-cutover-session-log.md` | nuvision | 151: \| 1 \| Global menu "Referral Progam" \| Replace both Referral Factory links with `https://referrals.nuvisionautoglass.com/` — desktop **and** mobile \| Pend... |
| `referral-cutover-session-log.md` | AZ state code | 190: \| 1 \| Old AZ page `…/7ztxOB` — find "Earn Rewards", see the voucher and bank-transfer list \| |
| `referral-cutover-session-log.md` | AZ state code | 194: \| 5 \| Old AZ page — find the word **"Disclaimer"** above the form \| |
| `referral-cutover-session-log.md` | AZ state code | 213: \| R‑10 \| Insurance provider is **required** on the referral form, but optional on the production quote form ("Leave blank for cash payments"). The AZ offer... |
| `referral-cutover-session-log.md` | nuvision | 217: \| C‑06 \| `/demo` title duplicated: "Demo Tour \\| NuVision Referrals \\| NuVision Referrals" \| |
| `referral-cutover-session-log.md` | nuvision | 220: \| — \| Out-of-area ZIP (SC, CO) is still a dead end — "We're not in that area yet" with no quote link. NuVision serves four states; the referral site knows ... |
| `referral-cutover-session-log.md` | hubspot | 228: 2. **B‑03** — write the referrer into HubSpot. Set `lead_source` to "Referral" in the same pass (it is currently "Marketing" on one record and "Outside Sales... |
| `referral-cutover-session-log.md` | nuvision | 245: *NuVision Auto Glass · referral cutover · reviewed 4 Sep, re-checked 7 Sep 2026 · read-only review* |
| `package.json` | hubspot | 17: "verify:hubspot-picklists": "node scripts/verify-hubspot-picklists.mjs" |
| `BUILD.md` | nuvision, hubspot | 5: Build a simple, white-label referral platform with NuVision Auto Glass as the first organization. The platform owns referral attribution, public tracking, ca... |
| `BUILD.md` | nuvision | 7: ## NuVision rules for version one |
| `BUILD.md` | arizona | 13: - Arizona shows the configured $50 customer and referrer offers. |
| `BUILD.md` | hubspot | 18: - Internal users can search across referrers, referred customers, referral codes, phones, emails, HubSpot IDs, and deal IDs. |
| `BUILD.md` | hubspot | 33: - HubSpot adapter boundary with webhook-event ingestion, idempotency, configurable stage mapping, and reconciliation support. |
| `BUILD.md` | nuvision | 43: - Add NuVision-first white-label tokens, responsive layout, shared components, navigation, and seeded demo data. |
| `BUILD.md` | arizona | 50: - **Tests:** Arizona offer, Florida no-offer behavior, unsupported/invalid ZIP behavior, form validation, unique-code creation, and attribution persistence. |
| `BUILD.md` | hubspot | 63: ### Stage 5 — HubSpot boundary and production readiness |
| `BUILD.md` | hubspot | 65: - Implement HubSpot configuration contracts, webhook verification boundary, idempotent event processing, status mapping, and visible sync health. |
| `BUILD.md` | nuvision, hubspot | 71: Included: multi-tenant data model, NuVision branding, state/ZIP routing, campaign configuration, trackers, internal operations, email previews/logs, rewards ... |
| `BUILD.md` | hubspot | 73: Deferred until credentials and provider choices are supplied: live HubSpot OAuth/private-app connection, live transactional-email sending, automated ACH/PayP... |
| `BUILD.md` | nuvision | 77: - A NuVision user can register, receive a referral link, and view a tracker. |
| `BUILD.md` | hubspot | 79: - An authorized internal user can find either party, inspect the complete timeline, see HubSpot sync state, and process an eligible reward. |
| `BUILD.md` | hubspot | 89: - [x] Stage 5 — Database schema and HubSpot webhook boundary |
| `CLAUDE.md` | hubspot | 16: - `/tests` — `node --test` suites (`.test.ts` / `.test.mjs`), one per feature area (auth, hubspot, referral rules, email templates) |
| `CLAUDE.md` | postgres | 23: - Drizzle ORM over Postgres (AWS RDS in prod; RDS requires `?sslmode=no-verify` in `DATABASE_URL` — see `.env.example`) |
| `CLAUDE.md` | hubspot | 25: - HubSpot integration (webhook + sync) is a side effect, not core path — see gotcha below |
| `CLAUDE.md` | hubspot | 34: - **Default to shared utilities** in `app/lib` for validation, formatting, HubSpot calls, email templates — not inline per route. |
| `CLAUDE.md` | hubspot | 43: - **Never hardcode credentials, tokens, or API keys.** Read from env vars (`DATABASE_URL`, `HUBSPOT_CLIENT_SECRET`, `AUTH_SECRET`) — never commit real values... |
| `CLAUDE.md` | hubspot | 44: - **Validate and sanitize all external input** — HubSpot webhook payloads, referral form submissions, API route bodies — before use. |
| `CLAUDE.md` | hubspot | 45: - **Verify HubSpot webhook signatures** using `HUBSPOT_CLIENT_SECRET` before trusting payloads; if unset, the integration should stay in test-mode/disabled, ... |
| `CLAUDE.md` | hubspot, postgres | 46: - **Wrap external API/network calls in try/catch** (HubSpot API, Postgres/RDS). Fail gracefully; never leak internal errors or stack traces to end users. |
| `CLAUDE.md` | hubspot | 48: - **Non-fatal side actions stay non-fatal.** HubSpot sync/logging failures must not abort the core referral flow (signup, tracking, admin actions). |
| `CLAUDE.md` | postgres | 55: - State management: server-side (Drizzle/Postgres) is source of truth; avoid client-side global state — prefer server actions/route handlers per existing `ap... |
| `CLAUDE.md` | hubspot | 56: - Error handling: throw/return typed errors from `app/lib`; never silently swallow failures in referral, auth, or HubSpot sync paths. |
| `CLAUDE.md` | postgres | 65: - RDS Postgres requires `?sslmode=no-verify` appended to `DATABASE_URL` (encrypts, skips CA verification) — plain local Postgres doesn't need it. |
| `CLAUDE.md` | hubspot | 67: - HubSpot webhook signature validation is gated by `HUBSPOT_CLIENT_SECRET`; leaving it unset intentionally disables/test-modes the webhook — don't "fix" this... |
| `CLAUDE.md` | hubspot | 75: 4. Confirm no secrets or credentials appear in the diff (check `.env`, config files, and any HubSpot/DB connection strings). |
| `DEMO.md` | nuvision | 1: # NuVision Referral Platform — Interactive Demo Script |
| `DEMO.md` | nuvision, hubspot | 8: First-party, white-label replacement for Referral Factory: NuVision owns referral attribution, ZIP/state routing, tracking, rewards, and the HubSpot sync bou... |
| `DEMO.md` | nuvision | 14: \| Referrer (NuVision customer) \| Register, get a shareable link, track referral status \| `/` \| |
| `DEMO.md` | nuvision | 15: \| Referred customer \| Enter ZIP, see offer, submit quote request, track progress \| `/r/NV-NUVISION` \| |
| `DEMO.md` | arizona | 25: ### Scene 2 — Referred customer journey (Arizona — has offer) |
| `DEMO.md` | nuvision | 26: - Open the generated link, or use seeded `/r/NV-NUVISION`. |
| `DEMO.md` | arizona, AZ state code | 27: - Enter ZIP `85001` (Arizona) → offer page shows **$50 customer + $50 referrer** offer, AZ-specific copy. |
| `DEMO.md` | hubspot | 45: - Overview metrics → global search (search by referrer, customer, phone, email, HubSpot ID, or deal ID — one box, all entities). |
| `DEMO.md` | hubspot | 46: - Open a referral detail → full timeline, HubSpot sync status indicator. |
| `DEMO.md` | hubspot | 63: \| HubSpot sync \| Boundary/webhook code exists (signature validation, idempotency, mapping) but disconnected — no live secret configured \| |
| `DEMO.md` | nuvision | 71: - Referred customer flow: `/r/NV-NUVISION` |
| `DEMO.md` | arizona | 72: - Arizona ZIP (has offer): `85001` |
| `DEMO.md` | hubspot | 81: - **"Is this connected to HubSpot yet?"** No — boundary code is built and tested, needs a live private-app/OAuth secret and confirmed pipeline/stage IDs. |
| `DEMO.md` | hubspot | 83: - **"When can we go live?"** After: D1-backed persistence replaces browser storage, admin auth is added, HubSpot + email providers are connected, and a payou... |
| `drizzle.config.ts` | postgres | 6: dialect: "postgresql", |
| `drizzle.config.ts` | postgres | 8: url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/referral", |
| `AGENT_HANDOFF.md` | nuvision | 1: # NuVision Referral Platform — Agent Handoff |
| `AGENT_HANDOFF.md` | nuvision, hubspot | 5: NuVision Auto Glass currently uses Referral Factory for its referral program. This project is a first-party, white-label replacement that owns referral attri... |
| `AGENT_HANDOFF.md` | nuvision | 7: The first customer is NuVision, but the data model and product structure are multi-tenant so the same platform can later serve other organizations with diffe... |
| `AGENT_HANDOFF.md` | nuvision | 22: 2. NuVision-only rule: ask **Please enter your ZIP code** before displaying offer language. |
| `AGENT_HANDOFF.md` | arizona | 24: 4. Arizona currently has the $50 customer benefit; Florida has state-specific messaging but no customer offer. |
| `AGENT_HANDOFF.md` | hubspot | 62: - HubSpot contact/deal ID |
| `AGENT_HANDOFF.md` | nuvision | 71: - `/r/NV-NUVISION` — referred-customer ZIP gate and quote flow |
| `AGENT_HANDOFF.md` | hubspot | 76: - `/api/webhooks/hubspot` — signed HubSpot webhook ingestion boundary |
| `AGENT_HANDOFF.md` | arizona | 80: - `85001` — Arizona, $50 customer benefit shown |
| `AGENT_HANDOFF.md` | hubspot | 92: - HubSpot signature validation, status mapping, idempotency, storage schema, and webhook route exist, but no production secret or OAuth connection is configu... |
| `AGENT_HANDOFF.md` | nuvision | 101: - Responsive NuVision-first design system |
| `AGENT_HANDOFF.md` | hubspot | 105: - HubSpot v3 HMAC signature validation with five-minute timestamp protection |
| `AGENT_HANDOFF.md` | hubspot | 106: - Stable HubSpot webhook idempotency keys |
| `AGENT_HANDOFF.md` | hubspot | 124: - `app/lib/hubspot.ts` — HubSpot mapping, signature validation, and idempotency |
| `AGENT_HANDOFF.md` | hubspot | 125: - `app/api/webhooks/hubspot/route.ts` — webhook receiver |
| `AGENT_HANDOFF.md` | nuvision, hubspot | 172: 3. Connect HubSpot through NuVision's private app initially or OAuth for the multi-tenant product. |
| `AGENT_HANDOFF.md` | hubspot | 173: 4. Confirm exact HubSpot pipeline IDs, deal stages, and the installation-completed property/timestamp. |
| `AGENT_HANDOFF.md` | nuvision | 175: 6. Choose a transactional email provider; verify the NuVision domain with SPF, DKIM, and DMARC. |
| `AGENT_HANDOFF.md` | nuvision | 188: - Current NuVision referral entry: `https://www.nuvisionautoglass.com/referral/` |
| `AGENT_HANDOFF.md` | nuvision | 189: - Current Referral Factory referrer page: `https://nuvision-auto-glass.referral-factory.com/7ztxOB` |
| `AGENT_HANDOFF.md` | nuvision | 190: - Current referred-customer page: `https://nuvision-auto-glass.referral-factory.com/uFXKzwsL` |
| `AGENT_HANDOFF.md` | hubspot | 191: - HubSpot webhook guide: `https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide` |
| `AGENT_HANDOFF.md` | hubspot | 192: - HubSpot request validation: `https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation` |
| `WALKTHROUGH.md` | nuvision | 1: # NuVision Referral Platform — Team Walkthrough |
| `WALKTHROUGH.md` | hubspot | 7: - Owns: referral attribution, ZIP/state routing, tracking, reward eligibility, HubSpot sync boundary. |
| `WALKTHROUGH.md` | postgres | 8: - Stack: Next.js/vinext + Postgres/Drizzle, deployed on AWS App Runner. |
| `WALKTHROUGH.md` | postgres | 12: - **Real DB persistence — done.** No more localStorage/demo arrays; referrer signup, referral submission, admin dashboard, and both tracker pages read/write ... |
| `WALKTHROUGH.md` | hubspot | 13: - **Not yet live:** HubSpot connection (code built, no secret configured), transactional email sending, reward payout automation, `/admin` auth (pre-producti... |
| `WALKTHROUGH.md` | arizona | 14: - **Supported states:** Arizona and Florida only. |
| `WALKTHROUGH.md` | nuvision, AZ state code | 26: 2. **Customer journey, AZ** — open the link (or seeded `/r/NV-NUVISION`), ZIP `85001` → $50/$50 offer → submit quote. |
| `WALKTHROUGH.md` | hubspot | 30: 6. **Admin** at `/admin` — search by referrer/customer/phone/email/HubSpot ID/deal ID; open a referral's timeline; try marking a "Closed Won, not installed" ... |
| `WALKTHROUGH.md` | nuvision | 36: - Admin login: `admin@nuvisionautoglass.com` (password in `~/.admin-password-nuvision-referral.txt`). |
| `WALKTHROUGH.md` | hubspot | 40: - **"Connected to HubSpot?"** No — boundary code (signature validation, idempotency, mapping) is built and tested, needs a live secret + confirmed pipeline/s... |
| `WALKTHROUGH.md` | hubspot | 42: - **"When's it live for real customers?"** After HubSpot + email provider are connected, `/admin` gets auth, and a payout method is chosen. |
| `TEST_MODE.md` | nuvision | 3: This workspace is intentionally configured as a test build for NuVision's internal product and development teams. |
| `TEST_MODE.md` | hubspot | 11: - HubSpot mappings, signature validation, idempotency, and the webhook storage boundary are implemented, but the webhook endpoint remains unavailable until a... |
| `TEST_MODE.md` | nuvision | 17: - Referred customer flow: `/r/NV-NUVISION` |
| `TEST_MODE.md` | arizona | 18: - Arizona test ZIP with offer: `85001` |
| `TEST_MODE.md` | nuvision, hubspot | 28: 2. Connect HubSpot using OAuth or a NuVision private app and configure the installation-completed property. |
| `TEST_MODE.md` | nuvision | 29: 3. Connect a transactional email provider and verify the NuVision sending domain with SPF, DKIM, and DMARC. |
| `USER_GUIDE.md` | nuvision | 2: title: NuVision Referral Platform — User Guide |
| `USER_GUIDE.md` | nuvision | 9: # NuVision Referral Platform — User Guide |
| `USER_GUIDE.md` | nuvision | 11: This guide covers every person who touches the platform: the **referrer** who shares a link, the **referred customer** who books a service, and the **NuVisio... |
| `USER_GUIDE.md` | nuvision | 21: \| Public referral site \| `https://referrals.nuvisionautoglass.com` \| |
| `USER_GUIDE.md` | arizona | 29: **Live markets:** Arizona and Florida only. |
| `USER_GUIDE.md` | arizona | 31: \| \| Arizona \| Florida \| |
| `USER_GUIDE.md` | nuvision | 65: - **A permanent referral link** — `referrals.nuvisionautoglass.com/r/NV-XX-####`. The code uses their initials plus four digits. It never expires. |
| `USER_GUIDE.md` | nuvision | 66: - **A copy button** and three share shortcuts: **Text**, **Email**, **WhatsApp** — each pre-filled with: *"NuVision took great care of my windshield. Use my ... |
| `USER_GUIDE.md` | nuvision | 127: - A confirmation screen: *"You're in good hands, [first name]"* — telling them a NuVision specialist calls **within one business hour** to confirm the glass ... |
| `USER_GUIDE.md` | hubspot | 130: - Behind the scenes: a HubSpot contact and deal are created, and the referrer is notified that their referral came in. |
| `USER_GUIDE.md` | nuvision | 151: \| **Referral received** \| The request reached NuVision \| The customer submitting the form \| |
| `USER_GUIDE.md` | hubspot | 152: \| **Appointment scheduled** \| Service is on the calendar \| HubSpot deal stage change — **automatic** \| |
| `USER_GUIDE.md` | hubspot | 153: \| **Installation completed** \| The glass installation is done \| HubSpot install-completed signal — **automatic** \| |
| `USER_GUIDE.md` | hubspot | 158: 1. **Status never goes backwards.** If someone corrects a HubSpot deal stage to an earlier value, the customer-facing status stays where it was. Customers ar... |
| `USER_GUIDE.md` | hubspot | 163: 2. A deal shows Closed Won in HubSpot. Can the reward be paid? |
| `USER_GUIDE.md` | hubspot | 219: \| **Integrations** \| Are HubSpot, email, and SMS actually connected? \| |
| `USER_GUIDE.md` | hubspot | 234: \| **CRM Operations** \| Customers, referrals, HubSpot sync, timelines \| |
| `USER_GUIDE.md` | hubspot | 244: \| Retry HubSpot sync \| ✅ \| ✅ \| ✅ \| ❌ \| ❌ \| |
| `USER_GUIDE.md` | hubspot | 280: - **HubSpot syncs pending** — with a **Retry** button |
| `USER_GUIDE.md` | hubspot | 283: There is also a **Sync with HubSpot** button that retries every pending sync at once. |
| `USER_GUIDE.md` | hubspot | 296: One search box matches across: referral ID, referral code, referrer name, referrer email, customer name, customer email, phone, ZIP, state, and HubSpot deal ID. |
| `USER_GUIDE.md` | AZ state code | 298: Two filters: **state** (AZ / FL) and **status**. Results page 10 at a time. |
| `USER_GUIDE.md` | hubspot | 306: - **Status** and **HubSpot sync state** |
| `USER_GUIDE.md` | hubspot | 308: - **Referral details** — code, market, HubSpot deal and stage, installation date, reward amount. Once paid, also **who** paid it and **when**. |
| `USER_GUIDE.md` | hubspot | 354: Payment unlocks only when the referral is at *Installation completed* **with a recorded completion timestamp**. A deal marked Closed Won in HubSpot is not en... |
| `USER_GUIDE.md` | hubspot | 358: 2. A referral shows Closed Won in HubSpot but the pay button is disabled. What do you check? |
| `USER_GUIDE.md` | AZ state code | 406: 3. **Internal name** — e.g. "AZ referrer — spring promo" |
| `USER_GUIDE.md` | arizona | 431: 2. You just activated a new SMS template for Arizona. What must you check immediately afterwards? |
| `USER_GUIDE.md` | brevo | 444: > Delivery and open tracking only work on the Brevo provider. Older records may sit permanently at "sent" — that is a historical limitation, not a fault. |
| `USER_GUIDE.md` | AZ state code | 449: - **Installation conversion by market** — AZ vs FL |
| `USER_GUIDE.md` | hubspot | 457: - **HubSpot CRM** — CRM writes, webhook endpoint |
| `USER_GUIDE.md` | twilio | 459: - **SMS (Twilio)** — live sending status |
| `USER_GUIDE.md` | hubspot | 461: **Check this page first when messages aren't arriving or referrals aren't reaching HubSpot.** |
| `USER_GUIDE.md` | hubspot | 475: \| Referral not in HubSpot \| Sync failed \| Open the drawer → check the error → **Retry as-is** or **Edit contact & retry** \| |
| `USER_GUIDE.md` | hubspot | 476: \| Reward won't pay \| No install-completed signal \| Confirm installation completion in HubSpot; Closed Won is not enough \| |
| `USER_GUIDE.md` | arizona | 491: - Arizona and Florida only; new states require a code change. |
| `USER_GUIDE.md` | hubspot | 502: \| **Sync status** \| Whether the referral reached HubSpot: pending, synced, failed, skipped \| |
| `apprunner.yaml` | hubspot | 18: - name: HUBSPOT_PIPELINE_ID |
| `apprunner.yaml` | hubspot | 20: - name: HUBSPOT_STAGE_NEW_ID |
| `apprunner.yaml` | AZ state code, twilio | 22: - name: TWILIO_FROM_NUMBER_AZ |
| `apprunner.yaml` | twilio | 24: - name: TWILIO_FROM_NUMBER_FL |
| `apprunner.yaml` | brevo | 26: - name: BREVO_SENDER_EMAIL |
| `apprunner.yaml` | nuvision | 27: value: "referral@nuvisionautoglass.com" |
| `apprunner.yaml` | brevo | 28: - name: BREVO_SENDER_NAME |
| `apprunner.yaml` | nuvision | 29: value: "NuVision Auto Glass" |
| `apprunner.yaml` | nuvision | 32: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/DATABASE_URL-xwlrMa |
| `apprunner.yaml` | nuvision | 34: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/AUTH_SECRET-ElRlvu |
| `apprunner.yaml` | hubspot | 35: - name: HUBSPOT_PRIVATE_APP_TOKEN |
| `apprunner.yaml` | nuvision, hubspot | 36: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/HUBSPOT_PRIVATE_APP_TOKEN-XBo9Kw |
| `apprunner.yaml` | hubspot | 37: - name: HUBSPOT_CLIENT_SECRET |
| `apprunner.yaml` | nuvision, hubspot | 38: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/HUBSPOT_CLIENT_SECRET-whGvtf |
| `apprunner.yaml` | twilio | 39: - name: TWILIO_ACCOUNT_SID |
| `apprunner.yaml` | nuvision, twilio | 40: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/TWILIO_ACCOUNT_SID-EbTkz2 |
| `apprunner.yaml` | twilio | 41: - name: TWILIO_AUTH_TOKEN |
| `apprunner.yaml` | nuvision, twilio | 42: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/TWILIO_AUTH_TOKEN-9UByE4 |
| `apprunner.yaml` | brevo | 43: - name: BREVO_API_KEY |
| `apprunner.yaml` | nuvision, brevo | 44: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/BREVO_API_KEY-oqkw2A |
| `apprunner.yaml` | brevo | 45: - name: BREVO_WEBHOOK_TOKEN |
| `apprunner.yaml` | nuvision, brevo | 46: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/BREVO_WEBHOOK_TOKEN-YQ027i |
| `apprunner.yaml` | brevo, smtp | 47: # Legacy Gmail SMTP - Brevo takes precedence when BREVO_API_KEY is set. |
| `apprunner.yaml` | brevo | 48: # Remove these two once Brevo delivery is verified in production. |
| `apprunner.yaml` | nuvision | 50: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/GMAIL_AUTH_EMAIL-AQgnUR |
| `apprunner.yaml` | nuvision | 52: value-from: arn:aws:secretsmanager:us-east-1:035722575731:secret:nuvision-referral/GMAIL_APP_PASSWORD-9FxCv0 |
| `app/page.tsx` | nuvision | 6: title: "Refer & Earn \| NuVision Auto Glass", |
| `app/page.tsx` | nuvision | 8: "Share NuVision Auto Glass with friends and track every successful referral.", |
| `app/page.tsx` | nuvision | 109: <a href="https://www.nuvisionautoglass.com/terms-conditions/">Program terms</a> |
| `app/page.tsx` | nuvision | 110: <a href="https://www.nuvisionautoglass.com/privacy-policy/">Privacy</a> |
| `app/globals.css` | nuvision | 16: /* Brand blues match nuvisionautoglass.com's real --nv-blue/-light/-lighter |
| `app/globals.css` | nuvision | 51: /* Matches nuvisionautoglass.com's --font-primary. */ |
| `app/globals.css` | hubspot | 480: .hubspot-id { color: #ed6f35; }.sync-synced { color: #61920b !important; }.sync-pending { color: var(--tone-orange-fg) !important; }.sync-error { color: var(... |
| `app/globals.css` | hubspot | 517: .integration-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }.integration-card { display: grid; gap: 18px; padding: 24px; }.integration-log... |
| `app/globals.css` | hubspot | 720: HubSpot, and the only action offered is fixing a mistyped ZIP. */ |
| `app/layout.tsx` | nuvision | 9: // Matches the brand font used on nuvisionautoglass.com (--font-primary: "Poppins", ...). |
| `app/layout.tsx` | nuvision | 24: const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "referrals.nuvisionautoglass.com"; |
| `app/layout.tsx` | nuvision | 27: const description = "A simple way to share NuVision, track every referral, and receive rewards."; |
| `app/layout.tsx` | nuvision | 30: title: { default: "NuVision Referrals", template: "%s \| NuVision Referrals" }, |
| `app/layout.tsx` | nuvision | 33: title: "NuVision Referrals", |
| `app/layout.tsx` | nuvision | 36: images: [{ url: new URL("/og.png", origin).toString(), width: 1200, height: 630, alt: "NuVision Referrals — Share. Track. Get rewarded." }], |
| `app/layout.tsx` | nuvision | 40: title: "NuVision Referrals", |
| `app/track/customer/[token]/page.tsx` | nuvision | 39: <p>A NuVision specialist will contact you to confirm the glass, insurance details, and appointment time.</p> |
| `app/track/customer/[token]/page.tsx` | nuvision | 51: <div className="support-note"><strong>Need help?</strong><span>Call NuVision at (855) 213-0100</span></div> |
| `app/track/referrer/[token]/page.tsx` | nuvision | 43: <strong>referrals.nuvisionautoglass.com/r/{referrer.code}</strong> |
| `app/track/referrer/[token]/page.tsx` | nuvision | 44: <div><CopyLinkButton link={`https://referrals.nuvisionautoglass.com/r/${referrer.code}`} /><Link href={`/r/${referrer.code}`}>Preview</Link></div> |
| `app/components/referrer-registration.tsx` | nuvision | 37: () => (result ? `${typeof window === "undefined" ? "https://referrals.nuvisionautoglass.com" : window.location.origin}/r/${result.code}` : ""), |
| `app/components/referrer-registration.tsx` | nuvision | 85: const shareText = encodeURIComponent("NuVision took great care of my windshield. Use my referral link to get started:"); |
| `app/components/referrer-registration.tsx` | nuvision | 100: <a href={`mailto:?subject=${encodeURIComponent("A NuVision referral for you")}&body=${shareText}%20${encodeURIComponent(link)}`}>Email</a> |
| `app/components/referral-journey.tsx` | nuvision | 175: <p>NuVision has received your request for {campaign.stateName}. A service specialist will contact you shortly.</p> |
| `app/components/referral-journey.tsx` | nuvision | 185: <li><strong>Within one business hour</strong><span>A NuVision specialist calls to confirm your glass and verify insurance coverage.</span></li> |
| `app/components/referral-journey.tsx` | arizona | 226: <small id="zip-help">Where the vehicle is — we service Arizona and Florida.</small> |
| `app/components/referral-journey.tsx` | hubspot | 236: further — nothing is sent to HubSpot, because an area we don't |
| `app/components/referral-journey.tsx` | nuvision | 243: Thanks for thinking of NuVision. We don&apos;t currently offer service in {zip}, so there&apos;s nothing |
| `app/components/referral-journey.tsx` | arizona | 262: conversion (Florida converts well below Arizona), so the whole |
| `app/components/google-tag-manager.tsx` | nuvision | 11: // problems with that. The referral flow was the fastest page NuVision owns and |
| `app/components/google-tag-manager.tsx` | nuvision | 15: // Properly scoping those tags to www.nuvisionautoglass.com is a change inside |
| `app/components/admin-dashboard.tsx` | hubspot | 12: hubspotConfigured: boolean; |
| `app/components/admin-dashboard.tsx` | brevo | 13: // null = no transactional provider configured at all. Brevo wins when both |
| `app/components/admin-dashboard.tsx` | brevo | 15: emailProvider: "brevo" \| "gmail" \| null; |
| `app/components/admin-dashboard.tsx` | brevo | 16: brevoWebhookConfigured: boolean; |
| `app/components/admin-dashboard.tsx` | twilio | 17: twilioConfigured: boolean; |
| `app/components/admin-dashboard.tsx` | hubspot | 21: import { markReferralPaidAction, retryHubSpotSyncsAction, retrySingleHubSpotSyncAction, updateCampaignAction, updateReferralContactAction } from "../lib/admi... |
| `app/components/admin-dashboard.tsx` | hubspot | 43: ["CRM Operations", "Customers, referrals, HubSpot sync, and timelines."], |
| `app/components/admin-dashboard.tsx` | AZ state code | 50: const CAMPAIGN_COLORS: Record<string, string> = { AZ: "sun", FL: "ocean" }; |
| `app/components/admin-dashboard.tsx` | hubspot | 155: const result = await retryHubSpotSyncsAction(); |
| `app/components/admin-dashboard.tsx` | hubspot | 162: setNotice(result.retried === 0 ? "Synced with HubSpot. Nothing needed retrying." : `Synced with HubSpot and retried ${result.retried} pending sync${result.re... |
| `app/components/admin-dashboard.tsx` | hubspot | 167: const result = await retrySingleHubSpotSyncAction(referral.id); |
| `app/components/admin-dashboard.tsx` | hubspot | 175: setNotice(result.referral.syncStatus === "synced" ? `${result.referral.id} synced with HubSpot.` : `${result.referral.id} still failed: ${result.referral.syn... |
| `app/components/admin-dashboard.tsx` | hubspot | 188: setNotice(result.referral.syncStatus === "synced" ? `${result.referral.id} updated and synced with HubSpot.` : `${result.referral.id} updated, but still fail... |
| `app/components/admin-dashboard.tsx` | nuvision | 268: <div><span className="admin-breadcrumb">NuVision /</span><strong>{sections.find((item) => item.key === section)?.label}</strong></div> |
| `app/components/admin-dashboard.tsx` | hubspot | 381: stats.syncIssues.length > 0 ? { key: "sync", icon: "sync-icon", iconLabel: "↻", title: `${stats.syncIssues.length} HubSpot sync${stats.syncIssues.length === ... |
| `app/components/admin-dashboard.tsx` | hubspot | 401: <button className="text-button" onClick={onRetrySync} disabled={retryingSync} type="button">{retryingSync ? "Syncing with HubSpot…" : "Sync with HubSpot"}</b... |
| `app/components/admin-dashboard.tsx` | AZ state code, hubspot | 418: return <><PageTitle eyebrow="CRM OPERATIONS" title="Referrals & people" description="Search any referrer or referred customer across campaigns and HubSpot." ... |
| `app/components/admin-dashboard.tsx` | hubspot | 422: return <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Referral</th><th>Referrer</th><th>Customer</th><th>Market</th><th>St... |
| `app/components/admin-dashboard.tsx` | AZ state code | 556: <label>Internal name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="AZ referrer — spring promo" required /></label> |
| `app/components/admin-dashboard.tsx` | AZ state code | 593: <label>Internal name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="AZ referrer — spring promo" required /></label> |
| `app/components/admin-dashboard.tsx` | hubspot | 629: return <><PageTitle eyebrow="FINANCE" title="Reward queue" description="Payments unlock only after an installation-completed signal." /><div className="rewar... |
| `app/components/admin-dashboard.tsx` | hubspot | 640: return <><PageTitle eyebrow="COMMUNICATIONS" title="Email activity" description="Referral-specific transactional emails, delivery, and tracker clicks." /><di... |
| `app/components/admin-dashboard.tsx` | hubspot | 696: <div className="integration-logo hubspot-logo">H</div> |
| `app/components/admin-dashboard.tsx` | hubspot | 697: <div><span className={status.hubspotConfigured ? "active-dot" : "paused-dot"}>{status.hubspotConfigured ? "Live" : "Not configured"}</span><h2>HubSpot CRM</h... |
| `app/components/admin-dashboard.tsx` | hubspot | 698: <dl><div><dt>CRM writes</dt><dd>{status.hubspotConfigured ? "Enabled" : "Disabled"}</dd></div><div><dt>Webhook endpoint</dt><dd>{status.hubspotConfigured ? "... |
| `app/components/admin-dashboard.tsx` | brevo, smtp | 703: <dl><div><dt>Live sending</dt><dd>{status.emailProvider ? "Enabled" : "Disabled"}</dd></div><div><dt>Provider</dt><dd>{status.emailProvider === "brevo" ? "Br... |
| `app/components/admin-dashboard.tsx` | twilio | 707: <div><span className={status.twilioConfigured ? "active-dot" : "paused-dot"}>{status.twilioConfigured ? "Live" : "Not configured"}</span><h2>SMS (Twilio)</h2... |
| `app/components/admin-dashboard.tsx` | twilio | 708: <dl><div><dt>Live sending</dt><dd>{status.twilioConfigured ? "Enabled" : "Disabled"}</dd></div><div><dt>Provider</dt><dd>Twilio</dd></div></dl> |
| `app/components/admin-dashboard.tsx` | hubspot | 782: return <div className="drawer-backdrop"><button className="drawer-close-backdrop" onClick={onClose} aria-label="Close referral details" type="button" /><asid... |
| `app/components/admin-dashboard.tsx` | hubspot | 792: <section><span className="drawer-label">PEOPLE</span><div className="person-pair"><article><small>REFERRER</small><strong>{referral.referrer}</strong><span>{... |
| `app/components/brand.tsx` | nuvision | 3: export const NUVISION_HOME_URL = "https://www.nuvisionautoglass.com/"; |
| `app/components/brand.tsx` | nuvision | 8: export const GENERIC_REFERRAL_CODE = "NV-NUVISION"; |
| `app/components/brand.tsx` | nuvision | 18: export const TERMS_URL = `${NUVISION_HOME_URL}terms-conditions/`; |
| `app/components/brand.tsx` | nuvision | 26: export const PRIVACY_URL = `${NUVISION_HOME_URL}privacy-policy/`; |
| `app/components/brand.tsx` | nuvision | 40: <a className={`brand ${compact ? "brand-compact" : ""}`} href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home"> |
| `app/components/brand.tsx` | nuvision | 43: <strong>NuVision</strong> |
| `app/components/brand.tsx` | nuvision | 51: // for NuVision's actual logo lockup instead of the compact icon+text brand. |
| `app/components/brand.tsx` | nuvision | 54: <a className="brand-wordmark" href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home"> |
| `app/components/brand.tsx` | nuvision | 55: <img src="/nuvision-wordmark.png" alt="NuVision Auto Glass" width={150} height={56} /> |
| `app/components/brand.tsx` | nuvision | 60: // Themed brand: shows NuVision's real wordmark on any surface — the white |
| `app/components/brand.tsx` | nuvision | 66: <a className={`brand brand-header ${compact ? "brand-header-compact" : ""}`} href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home"> |
| `app/components/brand.tsx` | nuvision | 67: <img className="brand-header-wordmark" src="/nuvision-wordmark.png" alt="NuVision Auto Glass" width={150} height={56} /> |
| `app/components/brand.tsx` | nuvision | 68: <img className="brand-header-wordmark-light" src="/nuvision-wordmark-color.png" alt="NuVision Auto Glass" width={150} height={39} /> |
| `app/components/tracker.tsx` | nuvision | 5: { key: "received", label: "Referral received", helper: "The request reached NuVision." }, |
| `app/admin/dashboard-page.tsx` | hubspot | 61: hubspotConfigured: Boolean(process.env.HUBSPOT_PIPELINE_ID && process.env.HUBSPOT_PRIVATE_APP_TOKEN), |
| `app/admin/dashboard-page.tsx` | brevo | 62: emailProvider: process.env.BREVO_API_KEY |
| `app/admin/dashboard-page.tsx` | brevo | 63: ? "brevo" |
| `app/admin/dashboard-page.tsx` | brevo | 67: brevoWebhookConfigured: Boolean(process.env.BREVO_WEBHOOK_TOKEN), |
| `app/admin/dashboard-page.tsx` | twilio | 68: twilioConfigured: Boolean( |
| `app/admin/dashboard-page.tsx` | twilio | 69: process.env.TWILIO_ACCOUNT_SID && |
| `app/admin/dashboard-page.tsx` | twilio | 70: process.env.TWILIO_AUTH_TOKEN && |
| `app/admin/dashboard-page.tsx` | AZ state code, twilio | 71: (process.env.TWILIO_FROM_NUMBER \|\| process.env.TWILIO_FROM_NUMBER_AZ \|\| process.env.TWILIO_FROM_NUMBER_FL), |
| `app/admin/login/page.tsx` | nuvision | 18: <p>Sign in with your NuVision team credentials.</p> |
| `app/r/[code]/page.tsx` | nuvision | 3: import { GENERIC_REFERRAL_CODE, HeaderBrand, NUVISION_HOME_URL } from "../../components/brand"; |
| `app/r/[code]/page.tsx` | nuvision | 11: description: "Start your NuVision windshield service with a referral.", |
| `app/r/[code]/page.tsx` | nuvision | 54: <p>The code &quot;{code}&quot; doesn&apos;t match an active NuVision referrer. Double-check the link a friend sent you, or get a quote directly — no referral... |
| `app/r/[code]/page.tsx` | nuvision | 55: <a className="button button-primary" href={NUVISION_HOME_URL}>Get a quote</a> |
| `app/terms/page.tsx` | nuvision | 2: import { HeaderBrand, NUVISION_HOME_URL, PRIVACY_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "../components/brand"; |
| `app/terms/page.tsx` | nuvision | 7: description: "Eligibility rules, reward conditions, and payment terms for the NuVision Auto Glass referral program.", |
| `app/terms/page.tsx` | nuvision | 33: These terms govern the NuVision Auto Glass Referral Program (the &ldquo;Program&rdquo;). By joining the Program, |
| `app/terms/page.tsx` | arizona | 43: <li>The Program is offered only for vehicle service performed in <strong>Arizona and Florida</strong>. Referrals for service outside these states do not earn... |
| `app/terms/page.tsx` | nuvision | 49: <li>The person you refer must be a <strong>new</strong> NuVision customer &mdash; not an existing or former customer, and not someone already in our records ... |
| `app/terms/page.tsx` | nuvision | 64: <li>The <strong>installation or repair has been completed</strong> and recorded as completed by NuVision.</li> |
| `app/terms/page.tsx` | nuvision | 75: <li>The reward amount is the amount shown on the Program page for the referred customer&rsquo;s state at the time their referral is submitted. NuVision may c... |
| `app/terms/page.tsx` | nuvision | 78: <li>You are responsible for any taxes arising from rewards you receive. Where required by law, NuVision may request a completed Form W-9 and may issue a Form... |
| `app/terms/page.tsx` | nuvision | 84: NuVision may withhold, reverse, or cancel any reward, and may suspend or remove you from the Program, where |
| `app/terms/page.tsx` | nuvision | 87: NuVision brand terms, distributed by spam or unsolicited messaging, or otherwise in breach of these terms. |
| `app/terms/page.tsx` | nuvision | 92: yourself as NuVision, imply employment or agency, advertise on our behalf, or use our name or branding in |
| `app/terms/page.tsx` | nuvision | 98: NuVision determines whether a referral qualifies, based on our own service, sales and installation records. |
| `app/terms/page.tsx` | nuvision | 100: Decisions on eligibility and reward amounts are made at NuVision&rsquo;s sole and reasonable discretion and are |
| `app/terms/page.tsx` | nuvision | 107: NuVision may modify, suspend, or discontinue the Program, or change these terms, at any time and without |
| `app/terms/page.tsx` | nuvision | 124: The Program is provided &ldquo;as is&rdquo;. NuVision is not liable for referral links or messages that fail to |
| `app/terms/page.tsx` | arizona | 132: These terms are governed by the laws of the State of Arizona, without regard to its conflict-of-laws rules. |
| `app/terms/page.tsx` | nuvision | 139: or visit <a href={NUVISION_HOME_URL}>nuvisionautoglass.com</a>. |
| `app/terms/page.tsx` | nuvision | 144: policy that apply to glass repair and replacement work performed by NuVision Auto Glass. |
| `app/lib/referral-rules.ts` | AZ state code | 4: state: "AZ" \| "FL"; |
| `app/lib/referral-rules.ts` | AZ state code | 19: AZ: { |
| `app/lib/referral-rules.ts` | AZ state code | 20: state: "AZ", |
| `app/lib/referral-rules.ts` | arizona | 21: stateName: "Arizona", |
| `app/lib/referral-rules.ts` | arizona | 22: campaignName: "Arizona Friends & Family", |
| `app/lib/referral-rules.ts` | arizona | 23: serviceMessage: "Same-day mobile windshield replacement across Arizona.", |
| `app/lib/referral-rules.ts` | AZ state code | 45: if (prefix >= 850 && prefix <= 865) return campaigns.AZ; |
| `app/lib/service-area.ts` | nuvision | 4: // 3-digit ZIP prefixes NuVision actually services today — narrower than the |
| `app/lib/service-area.ts` | AZ state code | 5: // AZ/FL numeric ranges alone (e.g. AZ's 851/854/858/861/862 and FL's |
| `app/lib/service-area.ts` | hubspot | 15: // HubSpot's insurance_provider_2 picklist options, used to populate the |
| `app/lib/test-data-cleanup.ts` | hubspot | 21: // HubSpot is intentionally out of scope. Deleting a deal is irreversible and |
| `app/lib/brevo.ts` | brevo, smtp | 1: // Brevo (formerly Sendinblue) transactional email. Replaces Gmail SMTP, which |
| `app/lib/brevo.ts` | smtp | 3: // ever show "Delivered 0, Opened 0, Bounced 0" because SMTP tells you nothing |
| `app/lib/brevo.ts` | brevo | 4: // after the handshake. Brevo posts delivery/open/click/bounce webhooks back, |
| `app/lib/brevo.ts` | brevo, smtp | 7: const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"; |
| `app/lib/brevo.ts` | brevo | 9: export type BrevoSendInput = { |
| `app/lib/brevo.ts` | brevo | 17: // Surfaces in Brevo's own dashboard and comes back on every webhook, so a |
| `app/lib/brevo.ts` | brevo | 22: export type BrevoSendResult = { ok: true; providerMessageId: string } \| { ok: false; error: string }; |
| `app/lib/brevo.ts` | brevo | 24: export async function sendViaBrevo(input: BrevoSendInput, fetchImpl: typeof fetch = fetch): Promise<BrevoSendResult> { |
| `app/lib/brevo.ts` | brevo | 26: const response = await fetchImpl(BREVO_SEND_URL, { |
| `app/lib/brevo.ts` | brevo | 44: // Brevo returns {code, message} on failure; fall back to the status line |
| `app/lib/brevo.ts` | brevo | 54: return { ok: false, error: `Brevo send failed (${response.status})${message ? `: ${message}` : ""}` }; |
| `app/lib/brevo.ts` | brevo | 58: if (!payload.messageId) return { ok: false, error: "Brevo accepted the send but returned no messageId" }; |
| `app/lib/brevo.ts` | brevo | 61: return { ok: false, error: error instanceof Error ? error.message : "Unknown Brevo send failure" }; |
| `app/lib/brevo.ts` | brevo | 69: export type BrevoWebhookEvent = { |
| `app/lib/brevo.ts` | brevo | 113: // Brevo "error" event could never be recorded against an email we'd already |
| `app/lib/brevo.ts` | brevo | 123: export function statusForBrevoEvent(event: string): EmailStatus \| null { |
| `app/lib/brevo.ts` | brevo | 134: // Brevo doesn't sign its webhooks, so the endpoint is protected by an |
| `app/lib/brevo.ts` | brevo | 135: // unguessable token we generate and put in the URL we hand Brevo. This is the |
| `app/lib/brevo.ts` | brevo | 137: export function brevoEventKey(event: BrevoWebhookEvent): string { |
| `app/lib/brevo.ts` | brevo | 142: return `brevo:${messageId}:${event.event}:${event.id ?? ""}:${event.ts ?? event.date ?? ""}`; |
| `app/lib/hubspot.ts` | hubspot | 3: export type HubSpotDealSnapshot = { |
| `app/lib/hubspot.ts` | hubspot | 10: export type HubSpotWebhookEvent = { |
| `app/lib/hubspot.ts` | hubspot | 21: export function mapHubSpotDealToPublicStatus(snapshot: HubSpotDealSnapshot): PublicReferralStatus { |
| `app/lib/hubspot.ts` | hubspot | 28: export function hubSpotEventKey(event: HubSpotWebhookEvent) { |
| `app/lib/hubspot.ts` | hubspot | 35: function normalizedHubSpotUri(uri: string) { |
| `app/lib/hubspot.ts` | hubspot | 46: export async function createHubSpotV3Signature(secret: string, method: string, uri: string, body: string, timestamp: string) { |
| `app/lib/hubspot.ts` | hubspot | 48: const source = `${method.toUpperCase()}${normalizedHubSpotUri(uri)}${body}${timestamp}`; |
| `app/lib/hubspot.ts` | hubspot | 60: export async function validateHubSpotV3Signature(input: { secret: string; method: string; uri: string; body: string; timestamp: string; signature: string; no... |
| `app/lib/hubspot.ts` | hubspot | 64: const expected = await createHubSpotV3Signature(input.secret, input.method, input.uri, input.body, input.timestamp); |
| `app/lib/rate-limit.ts` | postgres | 30: // rate-limit-core.ts; this is just the Postgres-backed store around it. |
| `app/lib/referral-actions.ts` | hubspot | 8: import { syncReferralToHubSpot } from "./hubspot-sync.ts"; |
| `app/lib/referral-actions.ts` | hubspot | 65: // HubSpot reports grouped by make from fragmenting. |
| `app/lib/referral-actions.ts` | hubspot | 122: // Best-effort: a HubSpot outage must never block the customer's confirmation. |
| `app/lib/referral-actions.ts` | hubspot | 123: // Failures are recorded on the referral row (syncStatus/hubspotSyncError) for |
| `app/lib/referral-actions.ts` | hubspot | 125: syncReferralToHubSpot(id).catch(() => {}); |
| `app/lib/referee-notifications.ts` | twilio | 6: import { sendSms, twilioFromNumberForState } from "./sms-sender.ts"; |
| `app/lib/referee-notifications.ts` | nuvision | 13: const domain = org?.referralDomain ?? "referrals.nuvisionautoglass.com"; |
| `app/lib/referee-notifications.ts` | nuvision | 27: <p style="font-family:${EMAIL_FONT};font-size:15px;line-height:1.5;color:#1e293b">NuVision has received your ${campaign.stateName} windshield service request... |
| `app/lib/referee-notifications.ts` | nuvision | 31: <img src="https://referrals.nuvisionautoglass.com/nuvision-wordmark-color.png" alt="NuVision Auto Glass" width="120" style="display:block;margin-bottom:10px" /> |
| `app/lib/referee-notifications.ts` | nuvision | 32: <p style="margin:0 0 6px">NuVision Auto Glass &middot; Call 1855-213-0100</p> |
| `app/lib/referee-notifications.ts` | twilio | 45: const smsResult = await sendSms({ to: referral.phone, body: smsBody, from: twilioFromNumberForState(campaign.state) }); |
| `app/lib/referee-notifications.ts` | nuvision | 61: subject: `Your NuVision ${campaign.stateName} service request is confirmed`, |
| `app/lib/referee-notifications.ts` | nuvision | 63: text: `Thanks for your request, ${referral.firstName}! NuVision has received your ${campaign.stateName} windshield service request through ${referrerName}'s ... |
| `app/lib/hubspot-sync.ts` | hubspot | 4: import { createContact, createDeal, findContactByEmailOrPhone, getDealProperties, getDealStageLabel, resolvePicklistValue } from "./hubspot-client.ts"; |
| `app/lib/hubspot-sync.ts` | hubspot | 5: import { INSTALLATION_COMPLETED_PROPERTY, INSTALLATION_COMPLETED_VALUE, mapHubSpotDealToPublicStatus } from "./hubspot.ts"; |
| `app/lib/hubspot-sync.ts` | hubspot | 6: import type { HubSpotWebhookEvent } from "./hubspot.ts"; |
| `app/lib/hubspot-sync.ts` | hubspot | 14: // Resolves each candidate value against its HubSpot property (matching |
| `app/lib/hubspot-sync.ts` | hubspot | 16: // splits the results into properties HubSpot will accept vs. a human-readable |
| `app/lib/hubspot-sync.ts` | hubspot | 18: // (a make HubSpot doesn't have an option for, a typo, etc.) lands somewhere |
| `app/lib/hubspot-sync.ts` | hubspot | 39: // Puts the referrer into HubSpot at signup. Previously a referrer only got a |
| `app/lib/hubspot-sync.ts` | hubspot | 40: // contact record inside syncReferralToHubSpot, so anyone who joined and never |
| `app/lib/hubspot-sync.ts` | hubspot | 41: // referred a friend never reached HubSpot at all — the audit's "no referrer |
| `app/lib/hubspot-sync.ts` | hubspot | 44: export async function syncReferrerToHubSpot(referrerId: string) { |
| `app/lib/hubspot-sync.ts` | hubspot | 47: .select({ id: referrers.id, code: referrers.code, firstName: referrers.firstName, lastName: referrers.lastName, email: referrers.email, phone: referrers.phon... |
| `app/lib/hubspot-sync.ts` | hubspot | 51: if (!referrer \|\| referrer.hubspotContactId) return; |
| `app/lib/hubspot-sync.ts` | hubspot | 65: await db.update(referrers).set({ hubspotContactId: contactId }).where(eq(referrers.id, referrer.id)); |
| `app/lib/hubspot-sync.ts` | hubspot | 68: console.error(`[hubspot-sync] failed to sync referrer ${referrerId}:`, error); |
| `app/lib/hubspot-sync.ts` | hubspot | 72: export async function syncReferralToHubSpot(referralId: string) { |
| `app/lib/hubspot-sync.ts` | hubspot | 78: .select({ id: referrers.id, code: referrers.code, firstName: referrers.firstName, lastName: referrers.lastName, email: referrers.email, phone: referrers.phon... |
| `app/lib/hubspot-sync.ts` | hubspot | 84: if (!process.env.HUBSPOT_PIPELINE_ID \|\| !process.env.HUBSPOT_STAGE_NEW_ID) { |
| `app/lib/hubspot-sync.ts` | hubspot | 91: referral.hubspotContactId ?? |
| `app/lib/hubspot-sync.ts` | hubspot | 107: if (contactId !== referral.hubspotContactId) { |
| `app/lib/hubspot-sync.ts` | hubspot | 108: await db.update(referrals).set({ hubspotContactId: contactId }).where(eq(referrals.id, referralId)); |
| `app/lib/hubspot-sync.ts` | hubspot | 111: // Give the referrer their own HubSpot contact (created once, reused on every |
| `app/lib/hubspot-sync.ts` | hubspot | 113: // free-text property — per the audit, referrers previously reached HubSpot |
| `app/lib/hubspot-sync.ts` | hubspot | 115: let referrerContactId = referrer?.hubspotContactId ?? null; |
| `app/lib/hubspot-sync.ts` | hubspot | 128: await db.update(referrers).set({ hubspotContactId: referrerContactId }).where(eq(referrers.id, referrer.id)); |
| `app/lib/hubspot-sync.ts` | AZ state code | 132: { property: "install_state", value: stateName(referral.state as "AZ" \| "FL") }, |
| `app/lib/hubspot-sync.ts` | hubspot | 144: pipeline: process.env.HUBSPOT_PIPELINE_ID, |
| `app/lib/hubspot-sync.ts` | hubspot | 145: dealstage: process.env.HUBSPOT_STAGE_NEW_ID, |
| `app/lib/hubspot-sync.ts` | hubspot | 153: const stageLabel = await getDealStageLabel(process.env.HUBSPOT_PIPELINE_ID, deal.stage); |
| `app/lib/hubspot-sync.ts` | hubspot | 158: hubspotContactId: contactId, |
| `app/lib/hubspot-sync.ts` | hubspot | 159: hubspotDealId: deal.id, |
| `app/lib/hubspot-sync.ts` | hubspot | 160: hubspotStage: stageLabel, |
| `app/lib/hubspot-sync.ts` | hubspot | 162: hubspotSyncedAt: new Date(), |
| `app/lib/hubspot-sync.ts` | hubspot | 163: hubspotSyncError: null, |
| `app/lib/hubspot-sync.ts` | hubspot | 167: const message = error instanceof Error ? error.message : "Unknown HubSpot sync failure"; |
| `app/lib/hubspot-sync.ts` | hubspot | 168: console.error(`[hubspot-sync] referral ${referralId} failed:`, error); |
| `app/lib/hubspot-sync.ts` | hubspot | 169: await db.update(referrals).set({ syncStatus: "failed", hubspotSyncError: message }).where(eq(referrals.id, referralId)); |
| `app/lib/hubspot-sync.ts` | hubspot | 171: type: "hubspot_sync_failed", |
| `app/lib/hubspot-sync.ts` | hubspot | 172: summary: `HubSpot sync failed for referral ${referralId}: ${message}`, |
| `app/lib/hubspot-sync.ts` | hubspot | 178: export type ReferralDealState = { publicStatus: string; hubspotStage: string \| null; installationCompletedAt: Date \| null }; |
| `app/lib/hubspot-sync.ts` | hubspot | 179: export type DealEventUpdate = { hubspotStage?: string; installationCompletedAt?: Date; publicStatus: string } \| null; |
| `app/lib/hubspot-sync.ts` | hubspot | 183: // The internal hubspotStage record always reflects HubSpot's true current |
| `app/lib/hubspot-sync.ts` | hubspot | 185: // correcting a deal stage in HubSpot shouldn't make a customer's tracker |
| `app/lib/hubspot-sync.ts` | hubspot | 197: // installationCompletedAt on top of whatever HubSpot reports. |
| `app/lib/hubspot-sync.ts` | hubspot | 198: export function computeDealEventUpdate(referral: ReferralDealState, event: Pick<HubSpotWebhookEvent, "propertyName" \| "propertyValue" \| "occurredAt">): Dea... |
| `app/lib/hubspot-sync.ts` | hubspot | 201: const updates: { hubspotStage?: string; installationCompletedAt?: Date } = {}; |
| `app/lib/hubspot-sync.ts` | hubspot | 203: updates.hubspotStage = event.propertyValue; |
| `app/lib/hubspot-sync.ts` | hubspot | 210: const nextStage = updates.hubspotStage ?? referral.hubspotStage ?? ""; |
| `app/lib/hubspot-sync.ts` | hubspot | 212: const computedStatus = mapHubSpotDealToPublicStatus({ |
| `app/lib/hubspot-sync.ts` | hubspot | 223: // HubSpot's webhook payload carries the same opaque numeric stage id as the API, |
| `app/lib/hubspot-sync.ts` | hubspot | 226: export async function applyHubSpotDealEvent(event: HubSpotWebhookEvent) { |
| `app/lib/hubspot-sync.ts` | hubspot | 228: const [referral] = await db.select().from(referrals).where(eq(referrals.hubspotDealId, String(event.objectId))).limit(1); |
| `app/lib/hubspot-sync.ts` | hubspot | 232: event.propertyName === "dealstage" && event.propertyValue && process.env.HUBSPOT_PIPELINE_ID |
| `app/lib/hubspot-sync.ts` | hubspot | 233: ? { ...event, propertyValue: await getDealStageLabel(process.env.HUBSPOT_PIPELINE_ID, event.propertyValue) } |
| `app/lib/hubspot-sync.ts` | hubspot | 246: // installation-completed signal directly from HubSpot and applies whatever |
| `app/lib/hubspot-sync.ts` | hubspot | 250: export async function reconcileReferralFromHubSpot(referralId: string) { |
| `app/lib/hubspot-sync.ts` | hubspot | 253: if (!referral?.hubspotDealId \|\| referral.publicStatus === "paid") return; |
| `app/lib/hubspot-sync.ts` | hubspot | 255: const properties = await getDealProperties(referral.hubspotDealId, ["dealstage", INSTALLATION_COMPLETED_PROPERTY]); |
| `app/lib/hubspot-sync.ts` | hubspot | 256: let state: ReferralDealState = { publicStatus: referral.publicStatus, hubspotStage: referral.hubspotStage, installationCompletedAt: referral.installationComp... |
| `app/lib/hubspot-sync.ts` | hubspot | 261: const stageLabel = process.env.HUBSPOT_PIPELINE_ID ? await getDealStageLabel(process.env.HUBSPOT_PIPELINE_ID, rawStage) : rawStage; |
| `app/lib/hubspot-sync.ts` | hubspot | 265: state = { ...state, hubspotStage: stageUpdate.hubspotStage ?? state.hubspotStage, publicStatus: stageUpdate.publicStatus }; |
| `app/lib/referrer-actions.ts` | hubspot | 6: import { syncReferrerToHubSpot } from "./hubspot-sync.ts"; |
| `app/lib/referrer-actions.ts` | postgres | 8: // Postgres unique-violation SQLSTATE, surfaced by node-postgres as `code`. |
| `app/lib/referrer-actions.ts` | hubspot | 108: // Best-effort: a HubSpot outage must not fail the signup. |
| `app/lib/referrer-actions.ts` | hubspot | 109: syncReferrerToHubSpot(id).catch(() => {}); |
| `app/lib/admin-queries.ts` | hubspot | 21: hubspotDealId: referrals.hubspotDealId, |
| `app/lib/admin-queries.ts` | hubspot | 22: hubspotStage: referrals.hubspotStage, |
| `app/lib/admin-queries.ts` | hubspot | 29: syncError: referrals.hubspotSyncError, |
| `app/lib/admin-queries.ts` | hubspot | 50: hubspotDealId: row.hubspotDealId ?? "—", |
| `app/lib/admin-queries.ts` | hubspot | 51: hubspotStage: row.hubspotStage ?? "—", |
| `app/lib/referrer-notifications.ts` | twilio | 8: import { sendSms, twilioFromNumberForState } from "./sms-sender.ts"; |
| `app/lib/referrer-notifications.ts` | AZ state code | 29: // Both AZ and FL currently pay the same $50 referrer reward, so this is a |
| `app/lib/referrer-notifications.ts` | nuvision | 37: return org?.referralDomain ?? "referrals.nuvisionautoglass.com"; |
| `app/lib/referrer-notifications.ts` | nuvision | 78: <img src="https://referrals.nuvisionautoglass.com/nuvision-wordmark-color.png" alt="NuVision Auto Glass" width="120" style="display:block;margin-bottom:10px" /> |
| `app/lib/referrer-notifications.ts` | nuvision | 79: <p style="margin:0 0 6px">NuVision Auto Glass${postalAddress ? ` &middot; ${postalAddress}` : ""}</p> |
| `app/lib/referrer-notifications.ts` | nuvision | 80: <p style="margin:0 0 6px">You are receiving this because you joined the NuVision referral program.</p> |
| `app/lib/referrer-notifications.ts` | nuvision | 81: <p style="margin:0"><a href="https://referrals.nuvisionautoglass.com/terms" style="color:#64748b">Referral Program Terms</a> &middot; <a href="${NUVISION_PRI... |
| `app/lib/referrer-notifications.ts` | nuvision | 85: const NUVISION_PRIVACY_URL = "https://www.nuvisionautoglass.com/privacy-policy/"; |
| `app/lib/referrer-notifications.ts` | nuvision | 113: `NuVision Auto Glass${postalAddress ? ` - ${postalAddress}` : ""}`, |
| `app/lib/referrer-notifications.ts` | nuvision | 114: "You are receiving this because you joined the NuVision referral program.", |
| `app/lib/referrer-notifications.ts` | nuvision | 115: "Referral Program Terms: https://referrals.nuvisionautoglass.com/terms", |
| `app/lib/referrer-notifications.ts` | nuvision | 116: `Privacy Policy: ${NUVISION_PRIVACY_URL}`, |
| `app/lib/referrer-notifications.ts` | twilio | 167: const result = await sendSms({ to: referrer.phone, body, from: twilioFromNumberForState(campaign.state) }); |
| `app/lib/referrer-notifications.ts` | hubspot | 182: // Best-effort, like syncReferralToHubSpot: a referrer message failing (or |
| `app/lib/referrer-notifications.ts` | hubspot | 212: // Shared by every place a referral's publicStatus changes (the HubSpot |
| `app/lib/admin-actions.ts` | hubspot | 11: import { reconcileReferralFromHubSpot, syncReferralToHubSpot } from "./hubspot-sync.ts"; |
| `app/lib/admin-actions.ts` | hubspot | 65: export type RetryHubSpotSyncsResult = { ok: true; retried: number; referrals: AdminReferral[] } \| { ok: false; error: string }; |
| `app/lib/admin-actions.ts` | hubspot | 67: export async function retryHubSpotSyncsAction(): Promise<RetryHubSpotSyncsResult> { |
| `app/lib/admin-actions.ts` | hubspot | 70: return { ok: false, error: "You don't have permission to retry HubSpot syncs." }; |
| `app/lib/admin-actions.ts` | hubspot | 80: await syncReferralToHubSpot(id); |
| `app/lib/admin-actions.ts` | hubspot | 85: // anything HubSpot never told us about. |
| `app/lib/admin-actions.ts` | hubspot | 92: await reconcileReferralFromHubSpot(id); |
| `app/lib/admin-actions.ts` | hubspot | 98: action: "hubspot.sync_retried", |
| `app/lib/admin-actions.ts` | hubspot | 109: export type RetrySingleHubSpotSyncResult = { ok: true; referral: AdminReferral } \| { ok: false; error: string }; |
| `app/lib/admin-actions.ts` | hubspot | 111: export async function retrySingleHubSpotSyncAction(referralId: string): Promise<RetrySingleHubSpotSyncResult> { |
| `app/lib/admin-actions.ts` | hubspot | 114: return { ok: false, error: "You don't have permission to retry HubSpot syncs." }; |
| `app/lib/admin-actions.ts` | hubspot | 127: await syncReferralToHubSpot(referralId); |
| `app/lib/admin-actions.ts` | hubspot | 131: action: "hubspot.sync_retried", |
| `app/lib/admin-actions.ts` | hubspot | 148: // Lets an operator fix bad contact data (the most common reason HubSpot rejects |
| `app/lib/admin-actions.ts` | hubspot | 192: ...(emailOrPhoneChanged ? { hubspotContactId: null } : {}), |
| `app/lib/admin-actions.ts` | hubspot | 206: await syncReferralToHubSpot(input.referralId); |
| `app/lib/admin-rules.ts` | hubspot | 25: referral.hubspotDealId, |
| `app/lib/ops-alerts.ts` | nuvision | 15: body: JSON.stringify({ text: `[NuVision Referrals] ${event.summary}`, ...event }), |
| `app/lib/hubspot-client.ts` | hubspot | 1: const HUBSPOT_API_BASE = "https://api.hubapi.com"; |
| `app/lib/hubspot-client.ts` | hubspot | 4: export class HubSpotApiError extends Error { |
| `app/lib/hubspot-client.ts` | hubspot | 13: async function hubSpotFetch(path: string, init: RequestInit) { |
| `app/lib/hubspot-client.ts` | hubspot | 14: const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN; |
| `app/lib/hubspot-client.ts` | hubspot | 15: if (!token) throw new HubSpotApiError("HubSpot is not configured"); |
| `app/lib/hubspot-client.ts` | hubspot | 21: response = await fetch(`${HUBSPOT_API_BASE}${path}`, { |
| `app/lib/hubspot-client.ts` | hubspot | 32: throw new HubSpotApiError(`HubSpot API ${path} failed with ${response.status}: ${body}`, response.status); |
| `app/lib/hubspot-client.ts` | hubspot | 39: const result = await hubSpotFetch(`/crm/v3/objects/deals/${dealId}?${query}`, { method: "GET" }); |
| `app/lib/hubspot-client.ts` | hubspot | 43: export type HubSpotContactInput = { |
| `app/lib/hubspot-client.ts` | hubspot | 59: const result = await hubSpotFetch("/crm/v3/objects/contacts/search", { |
| `app/lib/hubspot-client.ts` | hubspot | 72: // HubSpot's own duplicate-detection (email uniqueness) is broader than our |
| `app/lib/hubspot-client.ts` | hubspot | 78: // many times an admin clicks retry. HubSpot's conflict body names the |
| `app/lib/hubspot-client.ts` | hubspot | 80: const HUBSPOT_EXISTING_ID_PATTERN = /Existing ID:\s*(\d+)/i; |
| `app/lib/hubspot-client.ts` | hubspot | 82: export async function createContact(input: HubSpotContactInput): Promise<string> { |
| `app/lib/hubspot-client.ts` | hubspot | 84: const result = await hubSpotFetch("/crm/v3/objects/contacts", { |
| `app/lib/hubspot-client.ts` | hubspot | 96: // silently only for people who weren't already in HubSpot. |
| `app/lib/hubspot-client.ts` | hubspot | 110: if (error instanceof HubSpotApiError && error.status === 409) { |
| `app/lib/hubspot-client.ts` | hubspot | 111: const existingId = error.message.match(HUBSPOT_EXISTING_ID_PATTERN)?.[1]; |
| `app/lib/hubspot-client.ts` | hubspot | 124: const result = await hubSpotFetch(`/crm/v3/pipelines/deals/${pipelineId}`, { method: "GET" }); |
| `app/lib/hubspot-client.ts` | hubspot | 130: // The dealstage property holds HubSpot's opaque numeric stage id, not the label |
| `app/lib/hubspot-client.ts` | hubspot | 131: // shown in the HubSpot UI. Resolve it once per pipeline and cache the mapping |
| `app/lib/hubspot-client.ts` | hubspot | 143: export type HubSpotDealInput = { |
| `app/lib/hubspot-client.ts` | hubspot | 145: // The referrer's own HubSpot contact, associated on the deal alongside the |
| `app/lib/hubspot-client.ts` | arizona | 159: // { install_state: "Arizona", veh_make__c: "Toyota" }. |
| `app/lib/hubspot-client.ts` | hubspot | 165: export async function createDeal(input: HubSpotDealInput): Promise<{ id: string; stage: string }> { |
| `app/lib/hubspot-client.ts` | hubspot | 166: const contactAssociationType = [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }]; |
| `app/lib/hubspot-client.ts` | hubspot | 172: const result = await hubSpotFetch("/crm/v3/objects/deals", { |
| `app/lib/hubspot-client.ts` | hubspot | 196: export type HubSpotPropertyOption = { label: string; value: string }; |
| `app/lib/hubspot-client.ts` | hubspot | 197: export type HubSpotPropertyDefinition = { name: string; label: string; type: string; options: HubSpotPropertyOption[] }; |
| `app/lib/hubspot-client.ts` | hubspot | 199: const propertyDefinitionCache = new Map<string, HubSpotPropertyDefinition \| null>(); |
| `app/lib/hubspot-client.ts` | hubspot | 201: async function getPropertyDefinition(objectType: string, propertyName: string): Promise<HubSpotPropertyDefinition \| null> { |
| `app/lib/hubspot-client.ts` | hubspot | 206: const result = await hubSpotFetch(`/crm/v3/properties/${objectType}/${propertyName}`, { method: "GET" }); |
| `app/lib/hubspot-client.ts` | hubspot | 207: const definition: HubSpotPropertyDefinition = { |
| `app/lib/hubspot-client.ts` | hubspot | 231: // option, or a value HubSpot doesn't recognize at all, would otherwise fail |
| `app/lib/sms-templates.ts` | nuvision | 16: referrer_welcome: `Hi ${firstName}, your NuVision referral link is ready.${share} You earn $${campaign.referrerReward} once a referred install is completed —... |
| `app/lib/sms-templates.ts` | nuvision | 21: reward_paid: `Hi ${firstName}, your $${campaign.referrerReward} NuVision referral reward has been paid. Thanks for the recommendation — your link stays activ... |
| `app/lib/sms-templates.ts` | nuvision | 35: return `Hi ${firstName}, thanks for your interest in NuVision Auto Glass through ${referrerName}'s referral!${offer} We'll reach out shortly to schedule your... |
| `app/lib/admin-data.ts` | AZ state code | 13: state: "AZ" \| "FL"; |
| `app/lib/admin-data.ts` | hubspot | 16: hubspotDealId: string; |
| `app/lib/admin-data.ts` | hubspot | 17: hubspotStage: string; |
| `app/lib/consent.ts` | nuvision | 15: "and I consent to receive emails and text messages from NuVision Auto Glass about my " + |
| `app/lib/totp.ts` | nuvision | 15: const otpauthUrl = generateURI({ issuer: "NuVision Referrals", label: email, secret }); |
| `app/lib/organization.ts` | nuvision | 7: const DEFAULT_ORGANIZATION_SLUG = process.env.DEFAULT_ORGANIZATION_SLUG ?? "nuvision"; |
| `app/lib/organization.ts` | nuvision | 8: const REFERRAL_DOMAIN = "referrals.nuvisionautoglass.com"; |
| `app/lib/organization.ts` | nuvision | 11: // organizationId to read from auth. NuVision is the only tenant today (see |
| `app/lib/organization.ts` | nuvision | 28: name: "NuVision Auto Glass", |
| `app/lib/organization.ts` | nuvision | 29: brandName: "NuVision", |
| `app/lib/sms-sender.ts` | twilio | 4: const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"; |
| `app/lib/sms-sender.ts` | nuvision, twilio | 7: // NuVision has one Twilio number per state (separate 10DLC campaigns) rather |
| `app/lib/sms-sender.ts` | twilio | 8: // than a single shared sender. TWILIO_FROM_NUMBER is the fallback for states |
| `app/lib/sms-sender.ts` | AZ state code, twilio | 11: AZ: "TWILIO_FROM_NUMBER_AZ", |
| `app/lib/sms-sender.ts` | twilio | 12: FL: "TWILIO_FROM_NUMBER_FL", |
| `app/lib/sms-sender.ts` | twilio | 15: export function twilioFromNumberForState(state: string): string \| undefined { |
| `app/lib/sms-sender.ts` | twilio | 17: return (envVar && process.env[envVar]) \|\| process.env.TWILIO_FROM_NUMBER; |
| `app/lib/sms-sender.ts` | twilio | 20: // Plain REST call instead of the Twilio SDK — the Messages API is one POST |
| `app/lib/sms-sender.ts` | twilio | 21: // endpoint, not worth a dependency. TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER |
| `app/lib/sms-sender.ts` | twilio | 25: const accountSid = process.env.TWILIO_ACCOUNT_SID; |
| `app/lib/sms-sender.ts` | twilio | 26: const authToken = process.env.TWILIO_AUTH_TOKEN; |
| `app/lib/sms-sender.ts` | twilio | 27: const fromNumber = input.from \|\| process.env.TWILIO_FROM_NUMBER; |
| `app/lib/sms-sender.ts` | twilio | 29: return { ok: false, error: "Twilio SMS sending is not configured" }; |
| `app/lib/sms-sender.ts` | twilio | 36: const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, { |
| `app/lib/sms-sender.ts` | twilio | 47: return { ok: false, error: `Twilio API failed with ${response.status}: ${data.message ?? "unknown error"}` }; |
| `app/lib/email-sender.ts` | brevo | 2: import { sendViaBrevo } from "./brevo.ts"; |
| `app/lib/email-sender.ts` | brevo | 6: export type EmailProvider = "brevo" \| "gmail"; |
| `app/lib/email-sender.ts` | nuvision | 8: const DEFAULT_SENDER_NAME = "NuVision Auto Glass"; |
| `app/lib/email-sender.ts` | brevo | 11: //   1. Brevo, when BREVO_API_KEY is set — the real transactional provider. |
| `app/lib/email-sender.ts` | smtp | 14: //   2. Gmail SMTP, when only GMAIL_* is set — the legacy path, kept so the |
| `app/lib/email-sender.ts` | brevo | 15: //      Brevo key can be added to production without a window where referral |
| `app/lib/email-sender.ts` | brevo | 16: //      emails silently stop. Remove the GMAIL_* secrets once Brevo is verified. |
| `app/lib/email-sender.ts` | hubspot, twilio | 18: //      no-op pattern as HubSpot/Twilio, so a missing provider degrades the |
| `app/lib/email-sender.ts` | brevo | 21: if (process.env.BREVO_API_KEY) return "brevo"; |
| `app/lib/email-sender.ts` | brevo | 29: return provider === "brevo" ? sendWithBrevo(input) : sendWithGmail(input); |
| `app/lib/email-sender.ts` | brevo | 32: async function sendWithBrevo(input: SendEmailInput): Promise<SendResult> { |
| `app/lib/email-sender.ts` | brevo | 33: const apiKey = process.env.BREVO_API_KEY!; |
| `app/lib/email-sender.ts` | brevo | 34: // The From address must be on a domain verified in Brevo (SPF/DKIM), or |
| `app/lib/email-sender.ts` | brevo | 35: // Brevo rejects the send outright rather than silently landing in spam. |
| `app/lib/email-sender.ts` | brevo | 36: const senderEmail = process.env.BREVO_SENDER_EMAIL \|\| process.env.GMAIL_FROM_EMAIL \|\| process.env.GMAIL_AUTH_EMAIL; |
| `app/lib/email-sender.ts` | brevo | 37: if (!senderEmail) return { ok: false, error: "BREVO_SENDER_EMAIL is not set" }; |
| `app/lib/email-sender.ts` | brevo | 39: const result = await sendViaBrevo({ |
| `app/lib/email-sender.ts` | brevo | 42: senderName: process.env.BREVO_SENDER_NAME \|\| DEFAULT_SENDER_NAME, |
| `app/lib/email-sender.ts` | brevo | 49: return result.ok ? { ok: true, providerMessageId: result.providerMessageId, provider: "brevo" } : result; |
| `app/lib/email-sender.ts` | smtp | 52: // Legacy Gmail path. GMAIL_AUTH_EMAIL is the mailbox SMTP logs into; |
| `app/lib/email-templates.ts` | nuvision | 27: subject: `${firstName}, your NuVision referral link is ready`, |
| `app/lib/email-templates.ts` | nuvision | 34: subject: "Your NuVision referral was received", |
| `app/lib/email-templates.ts` | nuvision | 41: subject: "Your NuVision appointment is scheduled", |
| `app/lib/email-templates.ts` | nuvision | 48: subject: "Your NuVision installation is complete", |
| `app/lib/email-templates.ts` | nuvision | 51: body: "Your installation has been marked complete. Thank you for choosing NuVision Auto Glass.", |
| `app/lib/email-templates.ts` | nuvision | 62: subject: "Your NuVision referral reward was paid", |
| `app/api/webhooks/brevo/route.ts` | brevo | 5: import { brevoEventKey, BrevoWebhookEvent, shouldAdvanceStatus, statusForBrevoEvent } from "../../../lib/brevo"; |
| `app/api/webhooks/brevo/route.ts` | brevo | 7: // Brevo does not sign its webhooks, so the endpoint is authenticated by an |
| `app/api/webhooks/brevo/route.ts` | brevo | 8: // unguessable token that we generate and embed in the URL configured in Brevo |
| `app/api/webhooks/brevo/route.ts` | brevo | 20: const expected = process.env.BREVO_WEBHOOK_TOKEN ?? ""; |
| `app/api/webhooks/brevo/route.ts` | brevo | 21: if (!expected) return Response.json({ error: "Brevo webhooks are not configured" }, { status: 503 }); |
| `app/api/webhooks/brevo/route.ts` | brevo | 26: console.error("[brevo-webhook] rejected a delivery with a bad or missing token"); |
| `app/api/webhooks/brevo/route.ts` | brevo | 31: let events: BrevoWebhookEvent[]; |
| `app/api/webhooks/brevo/route.ts` | brevo | 33: const payload = JSON.parse(body) as BrevoWebhookEvent \| BrevoWebhookEvent[]; |
| `app/api/webhooks/brevo/route.ts` | brevo | 44: const status = statusForBrevoEvent(event.event ?? ""); |
| `app/api/webhooks/brevo/route.ts` | brevo | 46: // acknowledged, not retried — returning an error would make Brevo redeliver |
| `app/api/webhooks/brevo/route.ts` | brevo | 50: const idempotencyKey = brevoEventKey(event); |
| `app/api/webhooks/brevo/route.ts` | hubspot | 52: // Same two-step as the HubSpot webhook: the row existing doesn't mean the |
| `app/api/webhooks/brevo/route.ts` | brevo | 57: provider: "brevo", |
| `app/api/webhooks/brevo/route.ts` | brevo | 77: // A send we have no record of (a Brevo email from outside this app, or one |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 4: import { hubSpotEventKey, HubSpotWebhookEvent, validateHubSpotV3Signature } from "../../../lib/hubspot"; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 5: import { applyHubSpotDealEvent } from "../../../lib/hubspot-sync"; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 9: const signature = request.headers.get("x-hubspot-signature-v3") ?? ""; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 10: const timestamp = request.headers.get("x-hubspot-request-timestamp") ?? ""; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 11: const secret = process.env.HUBSPOT_CLIENT_SECRET ?? ""; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 13: if (!secret) return Response.json({ error: "HubSpot is not configured" }, { status: 503 }); |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 16: // over plain HTTP, so request.url reports "http://" even though HubSpot |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 22: const valid = await validateHubSpotV3Signature({ secret, method: request.method, uri: externalUrl, body, timestamp, signature }); |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 25: console.error(`[hubspot-webhook] signature rejected. url=${externalUrl} ageSeconds=${ageSeconds}`); |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 26: return Response.json({ error: "Invalid HubSpot signature" }, { status: 401 }); |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 29: let events: HubSpotWebhookEvent[]; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 31: const payload = JSON.parse(body) as HubSpotWebhookEvent \| HubSpotWebhookEvent[]; |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 39: const idempotencyKey = hubSpotEventKey(event); |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 47: provider: "hubspot", |
| `app/api/webhooks/hubspot/route.ts` | hubspot | 62: await applyHubSpotDealEvent(event); |
| `app/demo/page.tsx` | nuvision | 5: // The root layout appends "\| NuVision Referrals" via its title template — |
| `app/demo/page.tsx` | nuvision | 6: // repeating it here produced "Demo Tour \| NuVision Referrals \| NuVision Referrals". |
| `app/demo/page.tsx` | nuvision | 8: description: "A guided, clickable walkthrough of every NuVision referral platform surface.", |
| `app/demo/page.tsx` | AZ state code | 22: hint: "Try ZIP 85001 (AZ, $50 offer) or 33101 (FL, no offer)", |
| `app/demo/page.tsx` | hubspot | 72: items: [{ href: null, label: "POST /api/webhooks/hubspot — signed HubSpot webhook ingestion", method: "POST" }], |
| `db/index.ts` | postgres | 2: import { drizzle } from "drizzle-orm/node-postgres"; |
| `db/schema.ts` | hubspot | 42: hubspotContactId: text("hubspot_contact_id"), |
| `db/schema.ts` | hubspot | 82: hubspotContactId: text("hubspot_contact_id"), |
| `db/schema.ts` | hubspot | 83: hubspotDealId: text("hubspot_deal_id"), |
| `db/schema.ts` | hubspot | 84: hubspotStage: text("hubspot_stage"), |
| `db/schema.ts` | hubspot | 86: hubspotSyncedAt: timestamp("hubspot_synced_at", { withTimezone: true }), |
| `db/schema.ts` | hubspot | 87: hubspotSyncError: text("hubspot_sync_error"), |
| `db/schema.ts` | hubspot | 89: }, (table) => [uniqueIndex("referral_hubspot_deal_idx").on(table.organizationId, table.hubspotDealId)]); |
| `tests/migrations.test.ts` | postgres | 12: // these run against a real Postgres engine here rather than being eyeballed. |
| `tests/migrations.test.ts` | nuvision | 58: await db.exec(`insert into organizations (id, name, slug, brand_name) values ('org1', 'NuVision', 'nuvision', 'NuVision'), ('org2', 'Other', 'other', 'Other'... |
| `tests/test-data-cleanup.test.ts` | postgres | 10: // match pattern is right is a real Postgres engine with real foreign keys, |
| `tests/test-data-cleanup.test.ts` | nuvision | 43: await q(`insert into organizations (id, slug, name, brand_name) values ('org1','nuvision','NuVision','NuVision')`); |
| `tests/test-data-cleanup.test.ts` | AZ state code | 44: await q(`insert into campaigns (id, organization_id, name, state, service_message, zip_rule) values ('camp-az','org1','AZ','AZ','msg','rule')`); |
| `tests/test-data-cleanup.test.ts` | nuvision | 47: await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-real','org1','NV-RE-0001','Real','Person','real@... |
| `tests/test-data-cleanup.test.ts` | AZ state code | 48: await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, ... |
| `tests/test-data-cleanup.test.ts` | nuvision | 49: await q(`insert into email_events (id, organization_id, referral_id, referrer_id, template_key, recipient) values ('ee-real','org1','ref-real','rer-real','re... |
| `tests/test-data-cleanup.test.ts` | AZ state code | 54: await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, ... |
| `tests/test-data-cleanup.test.ts` | AZ state code | 64: await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, ... |
| `tests/test-data-cleanup.test.ts` | nuvision | 171: await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-sonu','org1','NV-SR-0010','Sonu','Rathor','sonu@... |
| `tests/test-data-cleanup.test.ts` | nuvision | 172: await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-upper','org1','NV-UP-0011','SONU','RATHOR','SONU... |
| `tests/test-data-cleanup.test.ts` | nuvision | 186: await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-sonu','org1','NV-SR-0010','Sonu','Rathor','sonu@... |
| `tests/test-data-cleanup.test.ts` | AZ state code | 188: await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, ... |
| `tests/test-data-cleanup.test.ts` | nuvision | 220: await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-sonu','org1','NV-SR-0010','Sonu','Rathor','sonu@... |
| `tests/test-data-cleanup.test.ts` | nuvision | 257: assert.match(text, /real@nuvisionautoglass\.com/); |
| `tests/test-data-cleanup.test.ts` | nuvision | 271: await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-updesh','org1','NV-US-5348','Updesh','Singh','up... |
| `tests/vehicle-catalog.test.ts` | hubspot | 36: // grouping by make in HubSpot doesn't fragment. |
| `tests/hubspot.test.ts` | hubspot | 3: import { createHubSpotV3Signature, hubSpotEventKey, mapHubSpotDealToPublicStatus, validateHubSpotV3Signature } from "../app/lib/hubspot.ts"; |
| `tests/hubspot.test.ts` | hubspot | 6: assert.equal(mapHubSpotDealToPublicStatus({ dealStage: "closedwon", installationCompleted: false, installationCompletedAt: null, rewardPaid: false }), "sched... |
| `tests/hubspot.test.ts` | hubspot | 10: assert.equal(mapHubSpotDealToPublicStatus({ dealStage: "closedwon", installationCompleted: true, installationCompletedAt: "2026-08-11T10:00:00Z", rewardPaid:... |
| `tests/hubspot.test.ts` | hubspot | 11: assert.equal(mapHubSpotDealToPublicStatus({ dealStage: "closedwon", installationCompleted: true, installationCompletedAt: "2026-08-11T10:00:00Z", rewardPaid:... |
| `tests/hubspot.test.ts` | hubspot | 16: assert.equal(hubSpotEventKey(event), hubSpotEventKey({ ...event })); |
| `tests/hubspot.test.ts` | hubspot | 17: assert.notEqual(hubSpotEventKey(event), hubSpotEventKey({ ...event, eventId: 57 })); |
| `tests/hubspot.test.ts` | hubspot | 20: test("validates current HubSpot v3 signatures and rejects expired requests", async () => { |
| `tests/hubspot.test.ts` | hubspot | 23: const input = { secret: "test-secret", method: "POST", uri: "https://example.com/api/webhooks/hubspot", body: '[{"eventId":1}]', timestamp }; |
| `tests/hubspot.test.ts` | hubspot | 24: const signature = await createHubSpotV3Signature(input.secret, input.method, input.uri, input.body, input.timestamp); |
| `tests/hubspot.test.ts` | hubspot | 25: assert.equal(await validateHubSpotV3Signature({ ...input, signature, now }), true); |
| `tests/hubspot.test.ts` | hubspot | 26: assert.equal(await validateHubSpotV3Signature({ ...input, signature, now: now + 10 * 60 * 1000 }), false); |
| `tests/referral-actions.test.ts` | AZ state code | 31: test("customer referral is rejected when the ZIP falls outside AZ/FL coverage", async () => { |
| `tests/rendered-html.test.mjs` | nuvision | 14: test("server-renders the NuVision referral registration experience", async () => { |
| `tests/rendered-html.test.mjs` | nuvision | 25: const response = await render("/r/NV-NUVISION"); |
| `tests/rendered-html.test.mjs` | nuvision | 31: // NV-NUVISION is the generic "I was referred" entry point linked from the |
| `tests/rendered-html.test.mjs` | postgres | 43: // Tracker token verification and the authenticated admin dashboard now query Postgres |
| `tests/rendered-html.test.mjs` | arizona | 50: // sidebar, and a developer placeholder ("Try 85001 for Arizona...") shipping to |
| `tests/rendered-html.test.mjs` | nuvision | 54: const response = await render("/r/NV-NUVISION"); |
| `tests/rendered-html.test.mjs` | arizona | 61: assert.doesNotMatch(html, /Try 85001 for Arizona/); |
| `tests/rendered-html.test.mjs` | nuvision | 66: const response = await render("/r/NV-NUVISION"); |
| `tests/rendered-html.test.mjs` | nuvision | 78: assert.match(html, /nuvisionautoglass\.com\/terms-conditions\//); |
| `tests/rendered-html.test.mjs` | nuvision | 79: assert.match(html, /nuvisionautoglass\.com\/privacy-policy\//); |
| `tests/rendered-html.test.mjs` | nuvision | 88: const response = await render("/r/NV-NUVISION"); |
| `tests/rendered-html.test.mjs` | arizona | 152: assert.match(html, /Arizona and Florida/); |
| `tests/rendered-html.test.mjs` | arizona | 154: assert.match(html, /governed by the laws of the State of Arizona/i); |
| `tests/rendered-html.test.mjs` | nuvision | 205: // C-06: the root layout already appends "\| NuVision Referrals". |
| `tests/rendered-html.test.mjs` | nuvision | 209: assert.match(html, /<title>Demo Tour \\| NuVision Referrals<\/title>/); |
| `tests/email-sender.test.ts` | brevo | 7: BREVO_API_KEY: process.env.BREVO_API_KEY, |
| `tests/email-sender.test.ts` | brevo | 8: BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL, |
| `tests/email-sender.test.ts` | brevo | 9: BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME, |
| `tests/email-sender.test.ts` | brevo | 35: // Brevo wins when both are set, so adding the key to production cuts over |
| `tests/email-sender.test.ts` | brevo | 37: test("Brevo takes precedence over Gmail when both are configured", () => { |
| `tests/email-sender.test.ts` | brevo | 42: process.env.BREVO_API_KEY = "xkeysib-test"; |
| `tests/email-sender.test.ts` | brevo | 43: assert.equal(configuredEmailProvider(), "brevo"); |
| `tests/email-sender.test.ts` | brevo | 46: test("sendEmail posts to Brevo with the verified sender and returns its messageId", async () => { |
| `tests/email-sender.test.ts` | brevo | 48: process.env.BREVO_API_KEY = "xkeysib-test"; |
| `tests/email-sender.test.ts` | nuvision, brevo | 49: process.env.BREVO_SENDER_EMAIL = "referrals@nuvisionautoglass.com"; |
| `tests/email-sender.test.ts` | nuvision, brevo | 50: process.env.BREVO_SENDER_NAME = "NuVision Referrals"; |
| `tests/email-sender.test.ts` | brevo, smtp | 57: return new Response(JSON.stringify({ messageId: "<202609.brevo@smtp>" }), { status: 201 }); |
| `tests/email-sender.test.ts` | brevo, smtp | 61: assert.deepEqual(result, { ok: true, providerMessageId: "<202609.brevo@smtp>", provider: "brevo" }); |
| `tests/email-sender.test.ts` | brevo, smtp | 62: assert.equal(capturedUrl, "https://api.brevo.com/v3/smtp/email"); |
| `tests/email-sender.test.ts` | nuvision | 66: assert.deepEqual(body.sender, { email: "referrals@nuvisionautoglass.com", name: "NuVision Referrals" }); |
| `tests/email-sender.test.ts` | brevo | 71: test("sendEmail surfaces a Brevo API error as ok:false instead of throwing", async () => { |
| `tests/email-sender.test.ts` | brevo | 73: process.env.BREVO_API_KEY = "xkeysib-test"; |
| `tests/email-sender.test.ts` | nuvision, brevo | 74: process.env.BREVO_SENDER_EMAIL = "referrals@nuvisionautoglass.com"; |
| `tests/email-sender.test.ts` | brevo | 79: assert.deepEqual(result, { ok: false, error: "Brevo send failed (401): unauthorized: Key not found" }); |
| `tests/email-sender.test.ts` | brevo | 82: test("sendEmail reports a missing Brevo sender rather than sending from nowhere", async () => { |
| `tests/email-sender.test.ts` | brevo | 84: process.env.BREVO_API_KEY = "xkeysib-test"; |
| `tests/email-sender.test.ts` | brevo | 87: assert.deepEqual(result, { ok: false, error: "BREVO_SENDER_EMAIL is not set" }); |
| `tests/email-sender.test.ts` | brevo | 91: // --- legacy Gmail path, kept until the Brevo key is verified in production --- |
| `tests/email-sender.test.ts` | nuvision | 112: process.env.GMAIL_FROM_EMAIL = "referrals@nuvisionautoglass.com"; |
| `tests/email-sender.test.ts` | nuvision | 119: assert.equal(capturedFrom, "referrals@nuvisionautoglass.com"); |
| `tests/email-sender.test.ts` | smtp | 127: sendMail: async () => { throw new Error("SMTP connection refused"); }, |
| `tests/email-sender.test.ts` | smtp | 130: assert.deepEqual(result, { ok: false, error: "SMTP connection refused" }); |
| `tests/hubspot-client.test.ts` | hubspot | 3: import { createContact, createDeal, findContactByEmailOrPhone, getDealProperties, getDealStageLabel, HubSpotApiError, resolvePicklistValue } from "../app/lib... |
| `tests/hubspot-client.test.ts` | hubspot | 5: const ORIGINAL_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN; |
| `tests/hubspot-client.test.ts` | hubspot | 8: process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token"; |
| `tests/hubspot-client.test.ts` | hubspot | 13: process.env.HUBSPOT_PRIVATE_APP_TOKEN = ORIGINAL_TOKEN; |
| `tests/hubspot-client.test.ts` | hubspot | 16: test("findContactByEmailOrPhone returns null when HubSpot has no match", async () => { |
| `tests/hubspot-client.test.ts` | hubspot | 89: (error: unknown) => error instanceof HubSpotApiError && error.status === 409, |
| `tests/hubspot-client.test.ts` | AZ state code | 101: dealName: "Jane Doe — AZ 85001", |
| `tests/hubspot-client.test.ts` | arizona | 108: extraProperties: { install_state: "Arizona", install_zip: "85001", veh_make__c: "Toyota" }, |
| `tests/hubspot-client.test.ts` | arizona | 126: assert.equal(body.properties.install_state, "Arizona"); |
| `tests/hubspot-client.test.ts` | AZ state code | 143: dealName: "Jane Doe — AZ 85001", |
| `tests/hubspot-client.test.ts` | AZ state code | 164: dealName: "Jane Doe — AZ 85001", |
| `tests/hubspot-client.test.ts` | hubspot | 224: test("a non-2xx HubSpot response surfaces as HubSpotApiError with the status code", async () => { |
| `tests/hubspot-client.test.ts` | hubspot | 226: await assert.rejects(() => findContactByEmailOrPhone("a@example.com", "1"), (error: unknown) => error instanceof HubSpotApiError && error.status === 429); |
| `tests/hubspot-client.test.ts` | hubspot | 229: test("missing token throws HubSpotApiError instead of making a request", async () => { |
| `tests/hubspot-client.test.ts` | hubspot | 230: delete process.env.HUBSPOT_PRIVATE_APP_TOKEN; |
| `tests/hubspot-client.test.ts` | hubspot | 232: await assert.rejects(() => findContactByEmailOrPhone("a@example.com", "1"), HubSpotApiError); |
| `tests/email-templates.test.ts` | arizona | 6: test("Arizona customer email includes the active offer", () => { |
| `tests/admin-rules.test.ts` | AZ state code, hubspot | 7: { id: "REF-482190", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Priya Mehta", customerFirstName: "Priya", c... |
| `tests/admin-rules.test.ts` | AZ state code, hubspot | 8: { id: "REF-482041", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Carlos Ruiz", customerFirstName: "Carlos", ... |
| `tests/admin-rules.test.ts` | AZ state code, hubspot | 9: { id: "REF-479812", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Avery Thomas", customerFirstName: "Avery", ... |
| `tests/admin-rules.test.ts` | nuvision, hubspot | 10: { id: "REF-482201", code: "NV-RK-1048", referrer: "Romy Kaur", referrerEmail: "romy@nuvisionautoglass.com", customer: "Maya Wilson", customerFirstName: "Maya... |
| `tests/admin-rules.test.ts` | hubspot | 25: assert.equal(rewardEligible({ ...installed, status: "scheduled", installedAt: null, hubspotStage: "Closed Won" }), false); |
| `tests/admin-rules.test.ts` | hubspot | 28: test("global referral search covers people, contact details, code, and HubSpot ID", () => { |
| `tests/brevo.test.ts` | brevo | 3: import { brevoEventKey, sendViaBrevo, shouldAdvanceStatus, statusForBrevoEvent } from "../app/lib/brevo.ts"; |
| `tests/brevo.test.ts` | brevo | 5: test("maps Brevo events onto the statuses the admin dashboard counts", () => { |
| `tests/brevo.test.ts` | brevo | 6: assert.equal(statusForBrevoEvent("delivered"), "delivered"); |
| `tests/brevo.test.ts` | brevo | 7: assert.equal(statusForBrevoEvent("unique_opened"), "opened"); |
| `tests/brevo.test.ts` | brevo | 8: assert.equal(statusForBrevoEvent("opened"), "opened"); |
| `tests/brevo.test.ts` | brevo | 9: assert.equal(statusForBrevoEvent("click"), "clicked"); |
| `tests/brevo.test.ts` | brevo | 10: assert.equal(statusForBrevoEvent("hard_bounce"), "bounced"); |
| `tests/brevo.test.ts` | brevo | 11: assert.equal(statusForBrevoEvent("soft_bounce"), "bounced"); |
| `tests/brevo.test.ts` | brevo | 12: assert.equal(statusForBrevoEvent("blocked"), "bounced"); |
| `tests/brevo.test.ts` | brevo | 13: assert.equal(statusForBrevoEvent("invalid_email"), "bounced"); |
| `tests/brevo.test.ts` | brevo | 14: assert.equal(statusForBrevoEvent("spam"), "bounced"); |
| `tests/brevo.test.ts` | brevo | 15: assert.equal(statusForBrevoEvent("unsubscribed"), "unsubscribed"); |
| `tests/brevo.test.ts` | brevo | 16: assert.equal(statusForBrevoEvent("proxy_open"), "opened"); |
| `tests/brevo.test.ts` | brevo | 17: assert.equal(statusForBrevoEvent("unique_proxy_open"), "opened"); |
| `tests/brevo.test.ts` | brevo | 18: assert.equal(statusForBrevoEvent("error"), "failed"); |
| `tests/brevo.test.ts` | brevo | 21: // Brevo's webhook *config* uses camelCase names (hardBounce, uniqueOpened) but |
| `tests/brevo.test.ts` | brevo | 24: test("every payload event name Brevo can send is either mapped or deliberately ignored", () => { |
| `tests/brevo.test.ts` | brevo | 30: const unmapped = payloadEvents.filter((event) => statusForBrevoEvent(event) === null); |
| `tests/brevo.test.ts` | brevo | 43: assert.equal(statusForBrevoEvent("DELIVERED"), "delivered"); |
| `tests/brevo.test.ts` | brevo | 49: assert.equal(statusForBrevoEvent("deferred"), null); |
| `tests/brevo.test.ts` | brevo | 50: assert.equal(statusForBrevoEvent("something_new"), null); |
| `tests/brevo.test.ts` | brevo | 88: const base = { event: "opened", "message-id": "<a@brevo>", id: 1, ts: 100 }; |
| `tests/brevo.test.ts` | brevo | 89: assert.equal(brevoEventKey(base), brevoEventKey({ ...base })); |
| `tests/brevo.test.ts` | brevo | 90: assert.notEqual(brevoEventKey(base), brevoEventKey({ ...base, ts: 200 })); |
| `tests/brevo.test.ts` | brevo | 91: assert.notEqual(brevoEventKey(base), brevoEventKey({ ...base, event: "click" })); |
| `tests/brevo.test.ts` | brevo | 92: assert.notEqual(brevoEventKey(base), brevoEventKey({ ...base, "message-id": "<b@brevo>" })); |
| `tests/brevo.test.ts` | brevo | 95: test("sendViaBrevo posts the transactional payload and returns the messageId", async () => { |
| `tests/brevo.test.ts` | brevo | 97: const result = await sendViaBrevo( |
| `tests/brevo.test.ts` | nuvision | 100: senderEmail: "referrals@nuvisionautoglass.com", |
| `tests/brevo.test.ts` | nuvision | 101: senderName: "NuVision Auto Glass", |
| `tests/brevo.test.ts` | brevo | 110: return new Response(JSON.stringify({ messageId: "<msg@brevo>" }), { status: 201 }); |
| `tests/brevo.test.ts` | brevo | 114: assert.deepEqual(result, { ok: true, providerMessageId: "<msg@brevo>" }); |
| `tests/brevo.test.ts` | brevo | 120: test("sendViaBrevo reports a network failure instead of throwing", async () => { |
| `tests/brevo.test.ts` | brevo | 121: const result = await sendViaBrevo( |
| `tests/brevo.test.ts` | brevo | 128: test("sendViaBrevo treats an accepted send with no messageId as a failure", async () => { |
| `tests/brevo.test.ts` | brevo | 129: const result = await sendViaBrevo( |
| `tests/brevo.test.ts` | brevo | 133: assert.deepEqual(result, { ok: false, error: "Brevo accepted the send but returned no messageId" }); |
| `tests/sms-sender.test.ts` | twilio | 3: import { sendSms, twilioFromNumberForState } from "../app/lib/sms-sender.ts"; |
| `tests/sms-sender.test.ts` | twilio | 5: const ORIGINAL_SID = process.env.TWILIO_ACCOUNT_SID; |
| `tests/sms-sender.test.ts` | twilio | 6: const ORIGINAL_TOKEN = process.env.TWILIO_AUTH_TOKEN; |
| `tests/sms-sender.test.ts` | twilio | 7: const ORIGINAL_FROM = process.env.TWILIO_FROM_NUMBER; |
| `tests/sms-sender.test.ts` | AZ state code, twilio | 8: const ORIGINAL_FROM_AZ = process.env.TWILIO_FROM_NUMBER_AZ; |
| `tests/sms-sender.test.ts` | twilio | 9: const ORIGINAL_FROM_FL = process.env.TWILIO_FROM_NUMBER_FL; |
| `tests/sms-sender.test.ts` | twilio | 13: process.env.TWILIO_ACCOUNT_SID = ORIGINAL_SID; |
| `tests/sms-sender.test.ts` | twilio | 14: process.env.TWILIO_AUTH_TOKEN = ORIGINAL_TOKEN; |
| `tests/sms-sender.test.ts` | twilio | 15: process.env.TWILIO_FROM_NUMBER = ORIGINAL_FROM; |
| `tests/sms-sender.test.ts` | AZ state code, twilio | 16: process.env.TWILIO_FROM_NUMBER_AZ = ORIGINAL_FROM_AZ; |
| `tests/sms-sender.test.ts` | twilio | 17: process.env.TWILIO_FROM_NUMBER_FL = ORIGINAL_FROM_FL; |
| `tests/sms-sender.test.ts` | twilio | 20: test("sendSms no-ops when Twilio credentials aren't configured", async () => { |
| `tests/sms-sender.test.ts` | twilio | 21: delete process.env.TWILIO_ACCOUNT_SID; |
| `tests/sms-sender.test.ts` | twilio | 22: delete process.env.TWILIO_AUTH_TOKEN; |
| `tests/sms-sender.test.ts` | twilio | 23: delete process.env.TWILIO_FROM_NUMBER; |
| `tests/sms-sender.test.ts` | twilio | 26: assert.deepEqual(result, { ok: false, error: "Twilio SMS sending is not configured" }); |
| `tests/sms-sender.test.ts` | twilio | 30: test("sendSms returns the Twilio message sid on success", async () => { |
| `tests/sms-sender.test.ts` | twilio | 31: process.env.TWILIO_ACCOUNT_SID = "AC_test"; |
| `tests/sms-sender.test.ts` | twilio | 32: process.env.TWILIO_AUTH_TOKEN = "token"; |
| `tests/sms-sender.test.ts` | twilio | 33: process.env.TWILIO_FROM_NUMBER = "+15550001111"; |
| `tests/sms-sender.test.ts` | twilio | 39: test("sendSms surfaces a non-2xx Twilio response as ok:false with the API message", async () => { |
| `tests/sms-sender.test.ts` | twilio | 40: process.env.TWILIO_ACCOUNT_SID = "AC_test"; |
| `tests/sms-sender.test.ts` | twilio | 41: process.env.TWILIO_AUTH_TOKEN = "token"; |
| `tests/sms-sender.test.ts` | twilio | 42: process.env.TWILIO_FROM_NUMBER = "+15550001111"; |
| `tests/sms-sender.test.ts` | twilio | 45: assert.deepEqual(result, { ok: false, error: "Twilio API failed with 400: The 'To' number is not a valid phone number." }); |
| `tests/sms-sender.test.ts` | twilio | 49: process.env.TWILIO_ACCOUNT_SID = "AC_test"; |
| `tests/sms-sender.test.ts` | twilio | 50: process.env.TWILIO_AUTH_TOKEN = "token"; |
| `tests/sms-sender.test.ts` | twilio | 51: process.env.TWILIO_FROM_NUMBER = "+15550001111"; |
| `tests/sms-sender.test.ts` | twilio | 70: test("sendSms uses the explicit from override instead of TWILIO_FROM_NUMBER", async () => { |
| `tests/sms-sender.test.ts` | twilio | 71: process.env.TWILIO_ACCOUNT_SID = "AC_test"; |
| `tests/sms-sender.test.ts` | twilio | 72: process.env.TWILIO_AUTH_TOKEN = "token"; |
| `tests/sms-sender.test.ts` | twilio | 73: process.env.TWILIO_FROM_NUMBER = "+15550001111"; |
| `tests/sms-sender.test.ts` | twilio | 83: test("twilioFromNumberForState picks the per-state number, falling back to TWILIO_FROM_NUMBER", () => { |
| `tests/sms-sender.test.ts` | twilio | 84: process.env.TWILIO_FROM_NUMBER = "+15550001111"; |
| `tests/sms-sender.test.ts` | AZ state code, twilio | 85: process.env.TWILIO_FROM_NUMBER_AZ = "+16233236445"; |
| `tests/sms-sender.test.ts` | twilio | 86: process.env.TWILIO_FROM_NUMBER_FL = "+17867861238"; |
| `tests/sms-sender.test.ts` | AZ state code, twilio | 87: assert.equal(twilioFromNumberForState("AZ"), "+16233236445"); |
| `tests/sms-sender.test.ts` | twilio | 88: assert.equal(twilioFromNumberForState("FL"), "+17867861238"); |
| `tests/sms-sender.test.ts` | AZ state code, twilio | 89: delete process.env.TWILIO_FROM_NUMBER_AZ; |
| `tests/sms-sender.test.ts` | AZ state code, twilio | 90: assert.equal(twilioFromNumberForState("AZ"), "+15550001111"); |
| `tests/hubspot-sync.test.ts` | hubspot | 3: import { computeDealEventUpdate, resolveDealFields } from "../app/lib/hubspot-sync.ts"; |
| `tests/hubspot-sync.test.ts` | hubspot | 4: import type { ReferralDealState } from "../app/lib/hubspot-sync.ts"; |
| `tests/hubspot-sync.test.ts` | hubspot | 5: import type { HubSpotWebhookEvent } from "../app/lib/hubspot.ts"; |
| `tests/hubspot-sync.test.ts` | hubspot | 7: const ORIGINAL_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN; |
| `tests/hubspot-sync.test.ts` | hubspot | 10: process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token"; |
| `tests/hubspot-sync.test.ts` | hubspot | 15: process.env.HUBSPOT_PRIVATE_APP_TOKEN = ORIGINAL_TOKEN; |
| `tests/hubspot-sync.test.ts` | hubspot | 18: const baseReferral: ReferralDealState = { publicStatus: "received", hubspotStage: "New", installationCompletedAt: null }; |
| `tests/hubspot-sync.test.ts` | hubspot | 20: function dealEvent(propertyName: string, propertyValue: string): HubSpotWebhookEvent { |
| `tests/hubspot-sync.test.ts` | hubspot | 24: test("a dealstage change updates hubspotStage and recomputes publicStatus", () => { |
| `tests/hubspot-sync.test.ts` | hubspot | 26: assert.equal(update?.hubspotStage, "Closed Won"); |
| `tests/hubspot-sync.test.ts` | hubspot | 59: test("publicStatus never regresses when a rep moves a deal backward in HubSpot", () => { |
| `tests/hubspot-sync.test.ts` | hubspot | 60: const scheduled: ReferralDealState = { publicStatus: "scheduled", hubspotStage: "Appointment Scheduled", installationCompletedAt: null }; |
| `tests/hubspot-sync.test.ts` | hubspot | 62: // hubspotStage still records HubSpot's true current state... |
| `tests/hubspot-sync.test.ts` | hubspot | 63: assert.equal(update?.hubspotStage, "New"); |
| `tests/hubspot-sync.test.ts` | hubspot | 69: const scheduled: ReferralDealState = { publicStatus: "scheduled", hubspotStage: "New", installationCompletedAt: null }; |
| `tests/hubspot-sync.test.ts` | arizona | 80: if (url.includes("resolve-state-a")) return new Response(JSON.stringify(propertyDefinition("resolve-state-a", "State", [{ label: "Arizona", value: "arizona" ... |
| `tests/hubspot-sync.test.ts` | arizona | 86: { property: "resolve-state-a", value: "ARIZONA" }, |
| `tests/hubspot-sync.test.ts` | arizona | 89: assert.deepEqual(properties, { "resolve-state-a": "arizona", "resolve-notes-field": "Camry" }); |
| `tests/hubspot-properties.test.ts` | hubspot | 4: import schema from "./fixtures/hubspot-properties.json" with { type: "json" }; |
| `tests/hubspot-properties.test.ts` | hubspot | 7: // to. A wrong property name doesn't degrade — HubSpot rejects the ENTIRE create |
| `tests/hubspot-properties.test.ts` | hubspot | 13: // createContact only runs when the person isn't already in HubSpot, so most |
| `tests/hubspot-properties.test.ts` | hubspot | 50: test("every property written to a HubSpot contact exists on contacts", async () => { |
| `tests/hubspot-properties.test.ts` | hubspot | 51: const source = await readFile(new URL("../app/lib/hubspot-client.ts", import.meta.url), "utf8"); |
| `tests/hubspot-properties.test.ts` | hubspot | 61: test("every property written to a HubSpot deal exists on deals", async () => { |
| `tests/hubspot-properties.test.ts` | hubspot | 62: const source = await readFile(new URL("../app/lib/hubspot-client.ts", import.meta.url), "utf8"); |
| `tests/hubspot-properties.test.ts` | hubspot | 73: const source = await readFile(new URL("../app/lib/hubspot-client.ts", import.meta.url), "utf8"); |
| `tests/sms-templates.test.ts` | nuvision | 36: const message = refereeConfirmationSms("Alex", "Jane Doe", campaign, "https://referrals.nuvisionautoglass.com/track/customer/abc123"); |
| `tests/sms-templates.test.ts` | nuvision | 39: assert.match(message, /Track it here: https:\/\/referrals\.nuvisionautoglass\.com\/track\/customer\/abc123/); |
| `tests/sms-templates.test.ts` | nuvision | 50: referralLink: "https://referrals.nuvisionautoglass.com/r/NV-SJ-9012", |
| `tests/sms-templates.test.ts` | nuvision | 51: trackerLink: "https://referrals.nuvisionautoglass.com/track", |
| `tests/service-area.test.ts` | postgres | 27: // An out-of-scope ZIP ends the interaction: the attempt is kept in Postgres for |
| `tests/service-area.test.ts` | hubspot | 28: // coverage analysis and goes no further. It must never reach HubSpot — an area |
| `tests/service-area.test.ts` | hubspot | 35: assert.doesNotMatch(source, /hubspot\|HubSpot/, "the out-of-area path must not call HubSpot"); |
| `tests/referral-rules.test.ts` | arizona | 5: test("routes Arizona ZIP codes to the Arizona offer", () => { |
| `tests/referral-rules.test.ts` | AZ state code | 7: assert.equal(campaign?.state, "AZ"); |
| `tests/referral-rules.test.ts` | AZ state code | 25: test("rejects a ZIP inside the old AZ/FL numeric range that serviceableZips.json doesn't actually list", () => { |
| `tests/referral-rules.test.ts` | hubspot | 63: test("stateName resolves the two-letter code to the full state name for HubSpot", () => { |
| `tests/referral-rules.test.ts` | arizona, AZ state code | 64: assert.equal(stateName("AZ"), "Arizona"); |
| `tests/referral-rules.test.ts` | hubspot | 68: // R-04: free-text vehicle make/model reached HubSpot in whatever casing the |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 70: "Fbook Post AZ", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 72: "Google Display Campaign AZ", |
| `tests/fixtures/hubspot-properties.json` | nuvision | 86: "NuVision Website (Organic)", |
| `tests/fixtures/hubspot-properties.json` | nuvision | 87: "Landing Pages (Paid) AGA & Nuvision", |
| `tests/fixtures/hubspot-properties.json` | brevo | 112: "Brevo", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 141: "Google Search Ad AZ", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 151: "AZ Fbook Video Installer", |
| `tests/fixtures/hubspot-properties.json` | arizona | 153: "Arizona - Facebook - Check Collage - Image Ad", |
| `tests/fixtures/hubspot-properties.json` | arizona | 154: "Arizona - Image Ad - 11/15/19", |
| `tests/fixtures/hubspot-properties.json` | arizona | 157: "Arizona - Facebook - Ace Ventura Video Ad", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 158: "AZ Mediaworks Email", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 162: "Road Trippin AZ Fbook", |
| `tests/fixtures/hubspot-properties.json` | arizona | 170: "Arizona - Couples Check Video", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 172: "Fbook AZ - Video 10.17", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 181: "AZ - Couples Check - Lead Ad", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 183: "Fbook AZ - Christmas Cash 11.15", |
| `tests/fixtures/hubspot-properties.json` | arizona | 197: "Arizona - Facebook - Scroll Stopper - Cash Drop", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 200: "AZ Astronaut Facebook", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 204: "Google Display Campaign AZ", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 205: "AZ Messenger Bot Cash Quiz", |
| `tests/fixtures/hubspot-properties.json` | arizona | 206: "Arizona - Google Post", |
| `tests/fixtures/hubspot-properties.json` | nuvision | 207: "Rodizio x NuVision", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 213: "IG AZ", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 215: "Fbook AZ", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 216: "AZ FB Lead Ad Campaign", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 218: "AZ - Spanish Ad - 11.12", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 219: "AZ Facebook $120 Minimum", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 221: "AZ Holiday Special $150", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 227: "AZ Youtube Ad 2021", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 229: "AZ Google Lead Ad Campaign", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 230: "AZ Google Search - $120 Guaranteed", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 232: "AZ $120 Valentines Offer", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 233: "AZ Youtube Lead TV Commercial", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 235: "AZ - Car Fin", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 258: "AZ Facebook Messenger Campaign", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 260: "AZ St. Patricks Day 2021", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 267: "Fbook Post AZ", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 279: "AZ Tiktok", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 294: "Google Display Ad AZ", |
| `tests/fixtures/hubspot-properties.json` | brevo | 510: "Brevo", |
| `tests/fixtures/hubspot-properties.json` | AZ state code | 585: "AALL (ABSOLUTE INS IN AZ)", |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 2: // Cross-checks insuranceProviders.json against HubSpot's real insurance_provider_2 |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 4: // value-or-label matching as app/lib/hubspot-client.ts's resolvePicklistValue. |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 7: // before it happens on a live lead, and re-catches it whenever HubSpot's |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 10: // Usage: HUBSPOT_PRIVATE_APP_TOKEN=pat-... node scripts/verify-hubspot-picklists.mjs |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 17: const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN; |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 20: console.error("Set HUBSPOT_PRIVATE_APP_TOKEN in the environment before running this script."); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 42: console.log("Fetching insurance_provider_2 definition from HubSpot..."); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 50: console.log(`HubSpot has ${definition.options.length} options for "${definition.label}". Checking ${insuranceProviders.length} local values...\n`); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 65: console.log(`All ${insuranceProviders.length} values in insuranceProviders.json match a HubSpot option.`); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 67: console.log(`${unmatched.length} value(s) in insuranceProviders.json do NOT match any HubSpot option and would fall back to install_notes__c:`); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 73: const hubspotOnly = definition.options.filter((option) => !localSet.has(option.value.toLowerCase()) && !localSet.has(option.label.toLowerCase())); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 74: if (hubspotOnly.length > 0) { |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 75: console.log(`\n${hubspotOnly.length} HubSpot option(s) have no entry in insuranceProviders.json (customers can never pick these from the dropdown):`); |
| `scripts/verify-hubspot-picklists.mjs` | hubspot | 76: hubspotOnly.forEach((option) => console.log(`  - ${option.label} (${option.value})`)); |
| `scripts/cleanup-test-data.ts` | hubspot | 141: console.log(`${TAG} Done. HubSpot was NOT touched — the CRM side is handled separately.`); |
| `deploy/README.md` | nuvision | 4: region `us-east-1`. App Runner service `nuvision-referral` |
| `deploy/README.md` | postgres | 5: (`https://uykwpxswmu.us-east-1.awsapprunner.com`), RDS Postgres instance |
| `deploy/README.md` | nuvision | 6: `nuvision-referral-db` (private, reachable only via an App Runner VPC |
| `deploy/README.md` | hubspot | 9: mint/verify/reject, and the HubSpot webhook's 503-when-unconfigured behavior. |
| `deploy/README.md` | nuvision | 60: cd nuvision-referral-agent-handoff/referral |
| `deploy/README.md` | hubspot | 94: ## 3. Fill in the real HubSpot secret when ready |
| `deploy/README.md` | hubspot | 96: `HUBSPOT_CLIENT_SECRET` was never created — Secrets Manager rejects an empty |
| `deploy/README.md` | nuvision, hubspot | 100: aws secretsmanager create-secret --name nuvision-referral/HUBSPOT_CLIENT_SECRET --secret-string "<real value>" --region us-east-1 |
| `deploy/README.md` | hubspot | 105: the webhook route (`app/api/webhooks/hubspot/route.ts`) correctly returns a |
| `deploy/README.md` | hubspot | 106: 503 "HubSpot is not configured" — verified live. |
| `deploy/README.md` | brevo | 108: ## 3b. Connect Brevo (transactional email) |
| `deploy/README.md` | brevo, smtp | 110: Brevo replaces Gmail SMTP. The point is delivery signal: SMTP tells you nothing |
| `deploy/README.md` | brevo | 112: ever read "Delivered 0, Opened 0, Bounced 0". Brevo posts |
| `deploy/README.md` | brevo | 115: The code ships inert: with no `BREVO_API_KEY` set, `sendEmail` keeps using |
| `deploy/README.md` | brevo | 116: Gmail, so there is no window where referral emails stop. Brevo takes over the |
| `deploy/README.md` | brevo | 119: **1. Verify the sending domain in Brevo** (Senders, Domains & Dedicated IPs -> |
| `deploy/README.md` | brevo | 120: Domains). Add the DKIM and SPF records Brevo shows to the DNS for |
| `deploy/README.md` | nuvision | 121: `nuvisionautoglass.com`, plus a DMARC record if there isn't one. The From |
| `deploy/README.md` | brevo | 122: address must be on a verified domain or Brevo rejects the send outright rather |
| `deploy/README.md` | brevo | 125: **2. Create the secrets.** The webhook token is ours, not Brevo's - Brevo does |
| `deploy/README.md` | nuvision, brevo, smtp | 130: aws secretsmanager create-secret --name nuvision-referral/BREVO_API_KEY   --secret-string "<the xkeysib-... key from Brevo -> SMTP & API -> API keys>" --regi... |
| `deploy/README.md` | nuvision, brevo | 132: aws secretsmanager create-secret --name nuvision-referral/BREVO_WEBHOOK_TOKEN   --secret-string "$(openssl rand -hex 32)" --region us-east-1 |
| `deploy/README.md` | nuvision, brevo | 140: aws secretsmanager describe-secret --secret-id nuvision-referral/BREVO_API_KEY   --region us-east-1 --query ARN --output text |
| `deploy/README.md` | brevo | 146: - name: BREVO_SENDER_EMAIL |
| `deploy/README.md` | nuvision | 147: value: "referrals@nuvisionautoglass.com"   # must be on the verified domain |
| `deploy/README.md` | brevo | 148: - name: BREVO_SENDER_NAME |
| `deploy/README.md` | nuvision | 149: value: "NuVision Auto Glass" |
| `deploy/README.md` | brevo | 152: **4. Point Brevo's webhook at the app** (Transactional -> Settings -> Webhooks). |
| `deploy/README.md` | brevo | 156: https://uykwpxswmu.us-east-1.awsapprunner.com/api/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN> |
| `deploy/README.md` | brevo | 163: **5. Verify.** Until the token is set the route returns 503 "Brevo webhooks are |
| `deploy/README.md` | nuvision | 176: the current admin user (`admin@nuvisionautoglass.com`, password shared with |
| `deploy/README.md` | nuvision | 192: await db.insert(organizations).values({ id: orgId, slug: "nuvision", name: "NuVision", brandName: "NuVision Auto Glass" }); |
| `deploy/README.md` | nuvision | 193: await db.insert(users).values({ id: userId, email: "you@nuvisionautoglass.com", passwordHash: await hashPassword("<choose a real password>") }); |
| `deploy/README.md` | nuvision | 194: await db.insert(teamMembers).values({ id: crypto.randomUUID(), organizationId: orgId, userId, email: "you@nuvisionautoglass.com", name: "Your Name", role: "o... |
| `deploy/README.md` | hubspot | 210: - [x] `curl -i https://<app-runner-url>/api/webhooks/hubspot` with no |
| `deploy/README.md` | hubspot | 211: signature → 503 "HubSpot is not configured". |
| `deploy/aws-setup.sh` | nuvision, postgres | 2: # Provisions the NuVision referral platform on AWS: RDS Postgres, Secrets Manager |
| `deploy/aws-setup.sh` | nuvision | 18: APP_NAME="${APP_NAME:-nuvision-referral}" |
| `deploy/aws-setup.sh` | postgres | 45: # Temporary: allow the operator's current IP to reach Postgres for the one-time |
| `deploy/aws-setup.sh` | postgres | 53: # 2. RDS Postgres instance |
| `deploy/aws-setup.sh` | postgres | 59: log "Creating RDS instance $DB_INSTANCE_ID (db.t4g.micro, Postgres 16)..." |
| `deploy/aws-setup.sh` | postgres | 63: --engine postgres \ |
| `deploy/aws-setup.sh` | postgres | 91: DATABASE_URL="postgresql://${DB_MASTER_USER}:${DB_MASTER_PASSWORD}@${DB_ENDPOINT}:5432/${DB_NAME}" |
| `deploy/aws-setup.sh` | hubspot | 111: # Real value must come from you — HubSpot app credentials aren't something I can generate. |
| `deploy/aws-setup.sh` | hubspot | 113: # "HubSpot is not configured" (503) state until you fill it in. |
| `deploy/aws-setup.sh` | hubspot | 114: if ! aws secretsmanager describe-secret --secret-id "${APP_NAME}/HUBSPOT_CLIENT_SECRET" --region "$AWS_REGION" >/dev/null 2>&1; then |
| `deploy/aws-setup.sh` | hubspot | 115: put_secret "${APP_NAME}/HUBSPOT_CLIENT_SECRET" "" |
| `deploy/aws-setup.sh` | hubspot | 120: HUBSPOT_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${APP_NAME}/HUBSPOT_CLIENT_SECRET" --query 'ARN' --output text --region "$AWS_REGION") |
| `deploy/aws-setup.sh` | hubspot | 141: \"Resource\": [\"$DATABASE_URL_ARN\", \"$AUTH_SECRET_ARN\", \"$HUBSPOT_SECRET_ARN\"]}] |
| `drizzle/0009_modern_obadiah_stane.sql` | hubspot | 1: ALTER TABLE "referrers" ADD COLUMN "hubspot_contact_id" text; |
| `drizzle/0004_daily_big_bertha.sql` | hubspot | 1: ALTER TABLE "referrals" ADD COLUMN "hubspot_synced_at" timestamp with time zone;--> statement-breakpoint |
| `drizzle/0004_daily_big_bertha.sql` | hubspot | 2: ALTER TABLE "referrals" ADD COLUMN "hubspot_sync_error" text; |
| `drizzle/0000_opposite_red_ghost.sql` | hubspot | 83: "hubspot_contact_id" text, |
| `drizzle/0000_opposite_red_ghost.sql` | hubspot | 84: "hubspot_deal_id" text, |
| `drizzle/0000_opposite_red_ghost.sql` | hubspot | 85: "hubspot_stage" text, |
| `drizzle/0000_opposite_red_ghost.sql` | hubspot | 157: CREATE UNIQUE INDEX "referral_hubspot_deal_idx" ON "referrals" USING btree ("organization_id","hubspot_deal_id");--> statement-breakpoint |
| `drizzle/meta/0008_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 990: "hubspot_contact_id": { |
| `drizzle/meta/0008_snapshot.json` | hubspot | 991: "name": "hubspot_contact_id", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 996: "hubspot_deal_id": { |
| `drizzle/meta/0008_snapshot.json` | hubspot | 997: "name": "hubspot_deal_id", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1002: "hubspot_stage": { |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1003: "name": "hubspot_stage", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1015: "hubspot_synced_at": { |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1016: "name": "hubspot_synced_at", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1021: "hubspot_sync_error": { |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1022: "name": "hubspot_sync_error", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1043: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1044: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0008_snapshot.json` | hubspot | 1053: "expression": "hubspot_deal_id", |
| `drizzle/meta/0003_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0003_snapshot.json` | hubspot | 675: "hubspot_contact_id": { |
| `drizzle/meta/0003_snapshot.json` | hubspot | 676: "name": "hubspot_contact_id", |
| `drizzle/meta/0003_snapshot.json` | hubspot | 681: "hubspot_deal_id": { |
| `drizzle/meta/0003_snapshot.json` | hubspot | 682: "name": "hubspot_deal_id", |
| `drizzle/meta/0003_snapshot.json` | hubspot | 687: "hubspot_stage": { |
| `drizzle/meta/0003_snapshot.json` | hubspot | 688: "name": "hubspot_stage", |
| `drizzle/meta/0003_snapshot.json` | hubspot | 716: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0003_snapshot.json` | hubspot | 717: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0003_snapshot.json` | hubspot | 726: "expression": "hubspot_deal_id", |
| `drizzle/meta/_journal.json` | postgres | 3: "dialect": "postgresql", |
| `drizzle/meta/0002_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0002_snapshot.json` | hubspot | 669: "hubspot_contact_id": { |
| `drizzle/meta/0002_snapshot.json` | hubspot | 670: "name": "hubspot_contact_id", |
| `drizzle/meta/0002_snapshot.json` | hubspot | 675: "hubspot_deal_id": { |
| `drizzle/meta/0002_snapshot.json` | hubspot | 676: "name": "hubspot_deal_id", |
| `drizzle/meta/0002_snapshot.json` | hubspot | 681: "hubspot_stage": { |
| `drizzle/meta/0002_snapshot.json` | hubspot | 682: "name": "hubspot_stage", |
| `drizzle/meta/0002_snapshot.json` | hubspot | 710: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0002_snapshot.json` | hubspot | 711: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0002_snapshot.json` | hubspot | 720: "expression": "hubspot_deal_id", |
| `drizzle/meta/0012_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1014: "hubspot_contact_id": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1015: "name": "hubspot_contact_id", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1020: "hubspot_deal_id": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1021: "name": "hubspot_deal_id", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1026: "hubspot_stage": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1027: "name": "hubspot_stage", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1039: "hubspot_synced_at": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1040: "name": "hubspot_synced_at", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1045: "hubspot_sync_error": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1046: "name": "hubspot_sync_error", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1067: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1068: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1077: "expression": "hubspot_deal_id", |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1189: "hubspot_contact_id": { |
| `drizzle/meta/0012_snapshot.json` | hubspot | 1190: "name": "hubspot_contact_id", |
| `drizzle/meta/0010_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1002: "hubspot_contact_id": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1003: "name": "hubspot_contact_id", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1008: "hubspot_deal_id": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1009: "name": "hubspot_deal_id", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1014: "hubspot_stage": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1015: "name": "hubspot_stage", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1027: "hubspot_synced_at": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1028: "name": "hubspot_synced_at", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1033: "hubspot_sync_error": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1034: "name": "hubspot_sync_error", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1055: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1056: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1065: "expression": "hubspot_deal_id", |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1177: "hubspot_contact_id": { |
| `drizzle/meta/0010_snapshot.json` | hubspot | 1178: "name": "hubspot_contact_id", |
| `drizzle/meta/0004_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 675: "hubspot_contact_id": { |
| `drizzle/meta/0004_snapshot.json` | hubspot | 676: "name": "hubspot_contact_id", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 681: "hubspot_deal_id": { |
| `drizzle/meta/0004_snapshot.json` | hubspot | 682: "name": "hubspot_deal_id", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 687: "hubspot_stage": { |
| `drizzle/meta/0004_snapshot.json` | hubspot | 688: "name": "hubspot_stage", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 700: "hubspot_synced_at": { |
| `drizzle/meta/0004_snapshot.json` | hubspot | 701: "name": "hubspot_synced_at", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 706: "hubspot_sync_error": { |
| `drizzle/meta/0004_snapshot.json` | hubspot | 707: "name": "hubspot_sync_error", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 728: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0004_snapshot.json` | hubspot | 729: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0004_snapshot.json` | hubspot | 738: "expression": "hubspot_deal_id", |
| `drizzle/meta/0005_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 675: "hubspot_contact_id": { |
| `drizzle/meta/0005_snapshot.json` | hubspot | 676: "name": "hubspot_contact_id", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 681: "hubspot_deal_id": { |
| `drizzle/meta/0005_snapshot.json` | hubspot | 682: "name": "hubspot_deal_id", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 687: "hubspot_stage": { |
| `drizzle/meta/0005_snapshot.json` | hubspot | 688: "name": "hubspot_stage", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 700: "hubspot_synced_at": { |
| `drizzle/meta/0005_snapshot.json` | hubspot | 701: "name": "hubspot_synced_at", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 706: "hubspot_sync_error": { |
| `drizzle/meta/0005_snapshot.json` | hubspot | 707: "name": "hubspot_sync_error", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 728: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0005_snapshot.json` | hubspot | 729: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0005_snapshot.json` | hubspot | 738: "expression": "hubspot_deal_id", |
| `drizzle/meta/0006_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 733: "hubspot_contact_id": { |
| `drizzle/meta/0006_snapshot.json` | hubspot | 734: "name": "hubspot_contact_id", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 739: "hubspot_deal_id": { |
| `drizzle/meta/0006_snapshot.json` | hubspot | 740: "name": "hubspot_deal_id", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 745: "hubspot_stage": { |
| `drizzle/meta/0006_snapshot.json` | hubspot | 746: "name": "hubspot_stage", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 758: "hubspot_synced_at": { |
| `drizzle/meta/0006_snapshot.json` | hubspot | 759: "name": "hubspot_synced_at", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 764: "hubspot_sync_error": { |
| `drizzle/meta/0006_snapshot.json` | hubspot | 765: "name": "hubspot_sync_error", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 786: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0006_snapshot.json` | hubspot | 787: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0006_snapshot.json` | hubspot | 796: "expression": "hubspot_deal_id", |
| `drizzle/meta/0009_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 990: "hubspot_contact_id": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 991: "name": "hubspot_contact_id", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 996: "hubspot_deal_id": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 997: "name": "hubspot_deal_id", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1002: "hubspot_stage": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1003: "name": "hubspot_stage", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1015: "hubspot_synced_at": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1016: "name": "hubspot_synced_at", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1021: "hubspot_sync_error": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1022: "name": "hubspot_sync_error", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1043: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1044: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1053: "expression": "hubspot_deal_id", |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1165: "hubspot_contact_id": { |
| `drizzle/meta/0009_snapshot.json` | hubspot | 1166: "name": "hubspot_contact_id", |
| `drizzle/meta/0000_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0000_snapshot.json` | hubspot | 591: "hubspot_contact_id": { |
| `drizzle/meta/0000_snapshot.json` | hubspot | 592: "name": "hubspot_contact_id", |
| `drizzle/meta/0000_snapshot.json` | hubspot | 597: "hubspot_deal_id": { |
| `drizzle/meta/0000_snapshot.json` | hubspot | 598: "name": "hubspot_deal_id", |
| `drizzle/meta/0000_snapshot.json` | hubspot | 603: "hubspot_stage": { |
| `drizzle/meta/0000_snapshot.json` | hubspot | 604: "name": "hubspot_stage", |
| `drizzle/meta/0000_snapshot.json` | hubspot | 632: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0000_snapshot.json` | hubspot | 633: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0000_snapshot.json` | hubspot | 642: "expression": "hubspot_deal_id", |
| `drizzle/meta/0011_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1014: "hubspot_contact_id": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1015: "name": "hubspot_contact_id", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1020: "hubspot_deal_id": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1021: "name": "hubspot_deal_id", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1026: "hubspot_stage": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1027: "name": "hubspot_stage", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1039: "hubspot_synced_at": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1040: "name": "hubspot_synced_at", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1045: "hubspot_sync_error": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1046: "name": "hubspot_sync_error", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1067: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1068: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1077: "expression": "hubspot_deal_id", |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1189: "hubspot_contact_id": { |
| `drizzle/meta/0011_snapshot.json` | hubspot | 1190: "name": "hubspot_contact_id", |
| `drizzle/meta/0007_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 972: "hubspot_contact_id": { |
| `drizzle/meta/0007_snapshot.json` | hubspot | 973: "name": "hubspot_contact_id", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 978: "hubspot_deal_id": { |
| `drizzle/meta/0007_snapshot.json` | hubspot | 979: "name": "hubspot_deal_id", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 984: "hubspot_stage": { |
| `drizzle/meta/0007_snapshot.json` | hubspot | 985: "name": "hubspot_stage", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 997: "hubspot_synced_at": { |
| `drizzle/meta/0007_snapshot.json` | hubspot | 998: "name": "hubspot_synced_at", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 1003: "hubspot_sync_error": { |
| `drizzle/meta/0007_snapshot.json` | hubspot | 1004: "name": "hubspot_sync_error", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 1025: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0007_snapshot.json` | hubspot | 1026: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0007_snapshot.json` | hubspot | 1035: "expression": "hubspot_deal_id", |
| `drizzle/meta/0001_snapshot.json` | postgres | 5: "dialect": "postgresql", |
| `drizzle/meta/0001_snapshot.json` | hubspot | 591: "hubspot_contact_id": { |
| `drizzle/meta/0001_snapshot.json` | hubspot | 592: "name": "hubspot_contact_id", |
| `drizzle/meta/0001_snapshot.json` | hubspot | 597: "hubspot_deal_id": { |
| `drizzle/meta/0001_snapshot.json` | hubspot | 598: "name": "hubspot_deal_id", |
| `drizzle/meta/0001_snapshot.json` | hubspot | 603: "hubspot_stage": { |
| `drizzle/meta/0001_snapshot.json` | hubspot | 604: "name": "hubspot_stage", |
| `drizzle/meta/0001_snapshot.json` | hubspot | 632: "referral_hubspot_deal_idx": { |
| `drizzle/meta/0001_snapshot.json` | hubspot | 633: "name": "referral_hubspot_deal_idx", |
| `drizzle/meta/0001_snapshot.json` | hubspot | 642: "expression": "hubspot_deal_id", |
| `public/nuvision-wordmark.png` | nuvision | filename |
| `public/nuvision-wordmark-color.png` | nuvision | filename |
