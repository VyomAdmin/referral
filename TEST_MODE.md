# Test Mode Handoff

This workspace is intentionally configured as a test build for NuVision's internal product and development teams.

## Safe test behavior

- Referrer registrations and referred-customer submissions remain on the current device for previewing the complete journey.
- Dashboard, trackers, email activity, analytics, and rewards use seeded demonstration records.
- Reward actions update only in the browser and do not send money.
- Email events are previews only; no transactional email provider is connected.
- HubSpot mappings, signature validation, idempotency, and the webhook storage boundary are implemented, but the webhook endpoint remains unavailable until a HubSpot client secret is configured.
- The UI displays a persistent Test mode notice.

## Recommended internal QA accounts and URLs

- Referrer registration: `/`
- Referred customer flow: `/r/NV-NUVISION`
- Arizona test ZIP with offer: `85001`
- Florida test ZIP without offer: `33101`
- Referrer tracker: `/track/referrer/demo`
- Customer tracker: `/track/customer/demo`
- Expired-link state: `/track/customer/expired`
- Internal operations: `/admin`

## Before production deployment

1. Choose and configure production authentication for internal users and passwordless customer tracking.
2. Connect HubSpot using OAuth or a NuVision private app and configure the installation-completed property.
3. Connect a transactional email provider and verify the NuVision sending domain with SPF, DKIM, and DMARC.
4. Replace browser-only form submission with the supplied D1 schema and server APIs.
5. Configure reward processing or retain an audited manual payout workflow.
6. Replace seeded records with tenant-scoped database queries.
7. Confirm state offer copy, legal terms, supported ZIP coverage, retention rules, and privacy requirements.
8. Run `npm test` and `npm run lint`, then deploy through the internal release process.

## Current validation

- 19 automated and server-rendered tests pass.
- Accessibility and code-quality linting passes.
- Production build passes.
- Database migration for 10 tables is generated and checked in.
