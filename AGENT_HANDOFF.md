# NuVision Referral Platform — Agent Handoff

## Why this project exists

NuVision Auto Glass currently uses Referral Factory for its referral program. This project is a first-party, white-label replacement that owns referral attribution, state-specific experiences, tracking, reward eligibility, email events, internal operations, and the HubSpot integration boundary.

The first customer is NuVision, but the data model and product structure are multi-tenant so the same platform can later serve other organizations with different branding, campaigns, forms, offers, CRM mappings, and domains.

## User requirements captured during discovery

### Referrer journey

1. Referrer registers with first name, last name, email, and phone.
2. Platform generates one permanent personal referral link.
3. Link can be copied or shared by text, email, or WhatsApp.
4. Referrer receives a branded welcome email with their link and a secure **Track My Referrals** action.
5. Referrer sees only a simple, privacy-safe progression for each referral.

### Referred-customer journey

1. Customer opens the shared link, with attribution already attached.
2. NuVision-only rule: ask **Please enter your ZIP code** before displaying offer language.
3. ZIP maps to a state and selects the correct campaign, page content, form, offer, terms, and email copy.
4. Arizona currently has the $50 customer benefit; Florida has state-specific messaging but no customer offer.
5. Customer submits name, email, phone, vehicle make/year/model, and insurance provider.
6. Customer receives a confirmation email and secure **Track My Service** action.

### Public statuses

Keep the public experience to four statuses:

1. Referral received
2. Appointment scheduled
3. Installation completed
4. Reward paid

The customer tracker stops at installation completion. The referrer tracker includes reward payment.

### Critical reward rule

Never pay based on `Closed Won` alone. The safe rule is:

```text
reward eligible =
  deal is Closed Won
  AND installation_completed is true
  AND installation_completed_at exists
  AND referral is not rejected, cancelled, or duplicated
```

The implementation and tests enforce the important part: `Closed Won` without an installation-completed signal remains at the scheduled stage and cannot unlock payment.

### Internal CRM/operations requirements

Internal staff need an all-customer view that can search either party by:

- Name
- Email
- Phone
- Referral ID/code
- ZIP/state
- HubSpot contact/deal ID

The internal tool includes overview metrics, referral search, detail timeline, campaign/state configuration, reward queue, email activity, analytics, teammates/roles, and integration status.

Suggested roles are Owner/Admin, CRM Operations, Rewards/Finance, Marketing, and Read-only/Support. Production administrative access must use real authentication, RBAC, 2FA, and optionally SSO.

## Current product surfaces

- `/` — referrer registration and unique-link result
- `/r/NV-SANDEEP` — referred-customer ZIP gate and quote flow
- `/track/referrer/demo` — referrer tracker
- `/track/customer/demo` — customer service tracker
- `/track/customer/expired` — expired secure-link state
- `/admin` — internal operations portal
- `/api/webhooks/hubspot` — signed HubSpot webhook ingestion boundary

Useful test ZIPs:

- `85001` — Arizona, $50 customer benefit shown
- `33101` — Florida, no additional customer offer
- `29401` — South Carolina
- `80202` — Colorado
- `10001` — unsupported-area state

## Current mode: safe test build

This is deliberately not a live production system.

- Referrer registrations and referred-customer submissions are stored only in browser storage for journey testing.
- Dashboard, tracker, email, analytics, and reward records are seeded demonstrations.
- Reward actions affect browser state only and do not send money.
- Email events are previews/logs only; no provider sends messages.
- HubSpot signature validation, status mapping, idempotency, storage schema, and webhook route exist, but no production secret or OAuth connection is configured.
- A persistent Test mode banner states that CRM writes, emails, and payments are disabled.
- The internal `/admin` surface is not protected by production authentication yet.

See `TEST_MODE.md` for the internal QA checklist and production prerequisites.

## Architecture implemented

- Next.js-compatible TypeScript application on the vinext/Sites runtime
- Responsive NuVision-first design system
- Drizzle ORM with a SQLite/D1-compatible schema
- Ten database tables covering organizations, campaigns, referrers, referrals, status events, rewards, emails, webhooks, team members, and audit events
- Generated migration at `drizzle/0000_living_ultimo.sql`
- HubSpot v3 HMAC signature validation with five-minute timestamp protection
- Stable HubSpot webhook idempotency keys
- Tenant-aware schema and campaign/state structure
- State-specific transactional-email template rules
- Social preview image at `public/og.png`

## Important source map

- `BUILD.md` — agreed architecture, stages, tests, scope, and progress
- `TEST_MODE.md` — internal test instructions and production checklist
- `app/page.tsx` — public referrer page
- `app/components/referrer-registration.tsx` — referrer creation/share behavior
- `app/r/[code]/page.tsx` — referred-customer route
- `app/components/referral-journey.tsx` — ZIP gate and customer form
- `app/track/**` — referrer and customer tracking pages
- `app/admin/page.tsx` and `app/components/admin-dashboard.tsx` — internal tool
- `app/lib/referral-rules.ts` — ZIP/state campaign resolution and referral-code rules
- `app/lib/email-templates.ts` — state-aware lifecycle email content
- `app/lib/admin-rules.ts` — search and reward eligibility logic
- `app/lib/hubspot.ts` — HubSpot mapping, signature validation, and idempotency
- `app/api/webhooks/hubspot/route.ts` — webhook receiver
- `db/schema.ts` — relational schema
- `drizzle/` — generated migration and metadata
- `tests/` — rule, integration-boundary, and rendered-route tests
- `context/screenshots/` — screenshots supplied during product discovery

## Validation status

At handoff:

- `npm test` passes 19 tests.
- `npm run lint` passes.
- Production build passes.
- Server-render checks cover registration, ZIP gate, admin dashboard, valid trackers, and expired trackers.
- Migration generation succeeds for all ten tables.

Standard setup for a fresh agent or developer:

```bash
npm ci
npm test
npm run lint
npm run dev
```

## Referral Factory feature comparison supplied by the user

Screenshots show Referral Factory offering plan-dependent features including:

- Users and campaigns
- Basic rewards and integrations
- Fraud alerts and referral analytics
- reCAPTCHA verification
- 2FA and teammate access
- Webhooks/API
- PayPal payout
- User verification
- Video support

The comparison also showed capabilities apparently unavailable in the displayed plans: 100% white label, custom domains, SSO, host-your-own-data, pay by invoice, and upload-your-own-HTML.

Potential differentiation for this product is true white labeling, custom domains, state/ZIP routing, configurable CRM mappings, SSO, and stronger data ownership/portability.

## Remaining work before production

1. Replace browser-only submissions and seeded dashboard records with tenant-scoped D1 queries and server actions/APIs.
2. Choose production authentication for internal users and passwordless tracking; enforce RBAC, 2FA, and optional SSO.
3. Connect HubSpot through NuVision's private app initially or OAuth for the multi-tenant product.
4. Confirm exact HubSpot pipeline IDs, deal stages, and the installation-completed property/timestamp.
5. Add reconciliation jobs in addition to webhooks.
6. Choose a transactional email provider; verify the NuVision domain with SPF, DKIM, and DMARC.
7. Add bot/fraud controls such as Cloudflare Turnstile/reCAPTCHA, velocity limits, duplicate detection, and audit review.
8. Decide between audited manual rewards and automated PayPal/ACH/Venmo payout providers.
9. Finalize state offers, ZIP coverage, terms, privacy, retention, consent, and customer-facing copy.
10. Add production secrets only through the internal deployment environment; never commit them.
11. Have the internal development team own deployment, domain setup, monitoring, and release approval.

## Deployment history note

Before the user requested an internal-developer deployment handoff, an owner-only private Sites preview of the pre-test-banner version was queued. No public deployment, live credentials, live CRM writes, email sending, or payouts were enabled. The final test-mode changes were committed locally and were intentionally not published by this agent.

## Reference URLs reviewed

- Current NuVision referral entry: `https://www.nuvisionautoglass.com/referral/`
- Current Referral Factory referrer page: `https://nuvision-auto-glass.referral-factory.com/7ztxOB`
- Current referred-customer page: `https://nuvision-auto-glass.referral-factory.com/uFXKzwsL`
- HubSpot webhook guide: `https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide`
- HubSpot request validation: `https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation`

## Handoff principle

Treat the test build as a validated product prototype and integration scaffold—not a production system. Preserve the safe reward rule, referrer attribution across ZIP routing, state-specific offer behavior, privacy-safe trackers, and tenant boundaries when replacing demo state with live infrastructure.
