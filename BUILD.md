# Referral Platform Build Plan

## Product goal

Build a simple, white-label referral platform with NuVision Auto Glass as the first organization. The platform owns referral attribution, public tracking, campaign and state routing, emails, reward status, and internal operations. HubSpot remains the source for sales and installation progress and synchronizes with the platform.

## NuVision rules for version one

- A referrer registers with first name, last name, email, and phone.
- The referrer receives one permanent, shareable referral link and a passwordless tracker link.
- A referred customer enters a five-digit ZIP code before seeing offer language.
- ZIP-to-state routing selects state-specific messaging, offer, form, terms, and emails.
- Arizona shows the configured $50 customer and referrer offers.
- Florida uses its own communication and can have no customer offer.
- The referred-customer form captures name, email, phone, vehicle make, year, model, and insurance provider.
- Public tracking uses four clear stages: Referral received, Appointment scheduled, Installation completed, and Reward paid.
- Reward eligibility requires an installation-completed signal; Closed Won alone is not sufficient.
- Internal users can search across referrers, referred customers, referral codes, phones, emails, HubSpot IDs, and deal IDs.

## Product surfaces

1. **Referrer registration** — branded signup, unique link, share actions, and tracker access.
2. **Referred-customer journey** — ZIP gate, state-specific offer page, quote form, and confirmation.
3. **Referrer tracker** — privacy-safe referral counts and status history.
4. **Customer tracker** — the referred customer's own service progress and applicable offer.
5. **Internal operations portal** — overview, referrals, people, campaigns, rewards, emails, analytics, team, integrations, and settings.

## Architecture

- Next.js-compatible TypeScript application using the Sites runtime.
- SQLite/D1-compatible relational persistence for organizations, campaigns, people, referral links, referrals, status events, rewards, emails, team members, and audit events.
- Server-side referral-code attribution; ZIP/state and campaign selection are stored with every submitted referral.
- HubSpot adapter boundary with webhook-event ingestion, idempotency, configurable stage mapping, and reconciliation support.
- Tenant-aware theming and configuration on every page and record.
- Passwordless tracking links designed as expiring, scoped tokens; local demo mode uses safe seeded sessions.
- Transactional-email event log and provider adapter; local demo mode previews queued messages without sending email.

## Delivery stages and tests

### Stage 1 — Foundation and design system

- Initialize the application and replace the starter experience.
- Add NuVision-first white-label tokens, responsive layout, shared components, navigation, and seeded demo data.
- **Tests:** type/build check, route smoke tests, and responsive component checks.

### Stage 2 — Public referral journey

- Build referrer registration, unique-link result, sharing controls, ZIP gate, state routing, customer offer/form, and confirmation.
- Preserve attribution across ZIP selection and form submission.
- **Tests:** Arizona offer, Florida no-offer behavior, unsupported/invalid ZIP behavior, form validation, unique-code creation, and attribution persistence.

### Stage 3 — Tracking and email events

- Build referrer and referred-customer trackers.
- Add email templates/events for registration, lead received, scheduled, installed, reward earned, and reward paid.
- **Tests:** privacy-safe referrer display, correct four-stage progress, state-specific email copy, and secure token failure states.

### Stage 4 — Internal operations portal

- Build overview metrics, global referral search, detail timeline, campaign/state offer configuration, reward queue, email log, analytics, team roles, and integration status.
- **Tests:** filtering/search, role restrictions, reward eligibility guard, campaign edits, and audited manual actions.

### Stage 5 — HubSpot boundary and production readiness

- Implement HubSpot configuration contracts, webhook verification boundary, idempotent event processing, status mapping, and visible sync health.
- Add accessibility, empty/error/loading states, and final responsive polish.
- **Tests:** duplicate webhook handling, stage-to-public-status mapping, Closed Won without installation protection, failed-sync retry state, production build, and end-to-end smoke flow.

## MVP boundaries

Included: multi-tenant data model, NuVision branding, state/ZIP routing, campaign configuration, trackers, internal operations, email previews/logs, rewards ledger, and HubSpot-ready integration boundary.

Deferred until credentials and provider choices are supplied: live HubSpot OAuth/private-app connection, live transactional-email sending, automated ACH/PayPal/Venmo payouts, SMS sending, fraud scoring, and additional CRM connectors.

## Definition of done

- A NuVision user can register, receive a referral link, and view a tracker.
- A referred customer can enter a ZIP, see correct state communication, submit a referral-attributed quote, and view their tracker.
- An authorized internal user can find either party, inspect the complete timeline, see HubSpot sync state, and process an eligible reward.
- No reward can be marked eligible before installation completion.
- All key flows pass automated tests and the production build succeeds.

## Build progress

- [x] Stage 1 — Foundation and design system
- [x] Stage 2 — Public referral journey and ZIP/state routing
- [x] Stage 3 — Referrer/customer tracking and email event rules
- [x] Stage 4 — Internal operations portal
- [x] Stage 5 — Database schema and HubSpot webhook boundary
- [x] Explicit test-mode UI and safe simulated integrations
- [ ] Internal developer deployment, live credentials, production provider configuration, and launch approval
