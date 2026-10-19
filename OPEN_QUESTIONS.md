# Open questions

These values are unset on purpose. The UI shows `not set` where a missing value would otherwise be displayed. Nothing in this list has been confirmed with the company, with counsel, or with a live vendor account.

## Company

- Legal name
- Brand name
- Domain
- From address and from name for staff invite email

## Market

- The Florida and South Carolina ZIP list. `coverage.csv.example` has a header and no rows. `scripts/import-coverage.ts` validates a CSV and writes only when `COVERAGE_IMPORT_URL` is set. No ZIP codes were added.

## Offer

- Referrer reward amount
- Customer benefit
- Offer text
- Payout method. The only line is `PAYOUT_LINE`. It is empty. The referrer page shows `not set`.

## GoHighLevel

- Plan, API access, and whether a private integration token meets the scopes for contacts, opportunities, conversations, and webhooks. If it does not, OAuth refresh is implemented and still needs a client id, secret, and refresh token.
- Location id and pipeline id
- Pipeline stage ids for the five stage names
- Custom field ids
- API `Version` header (`GHL_API_VERSION` is empty)
- Whether the stage-change path will be a signed marketplace `OpportunityStageUpdate` subscription or a workflow custom-webhook action. The custom-webhook signing method was not confirmed. Marketplace docs checked on 2026-10-19 describe Ed25519 in `X-GHL-Signature`, not HMAC-SHA256. The handler implements that Ed25519 check. See `docs/ghl-setup.md`.
- Whether this account will subscribe to `OutboundMessage` and `LCEmailStats`. The email page renders those events when they arrive. It is empty until a subscription exists.

## Auth and abuse

- Firebase project id, region, and hosting site. `.firebaserc` uses `demo-referral` as a local alias only.
- App Check provider and site key. Enforcement is on in Cloud Functions once `K_SERVICE` is set. The provider is not configured, so a production deploy will reject public forms until App Check is configured.
- Authenticator-app two-factor: Google Cloud Identity Platform documents TOTP MFA, including Google Authenticator, at https://cloud.google.com/identity-platform/docs/admin/enabling-totp-mfa (checked 2026-10-19). Firebase Authentication without Identity Platform does not provide that option. No Firebase project is attached here, so TOTP is not turned on. Email and password sign-in still works without it.
- Browser API key restrictions, after a domain exists.

## Counsel

- Terms
- Privacy policy
- SMS consent wording, including STOP and HELP

The pages currently show the placeholder strings in `config/site.ts`. Text-message registration should not start until counsel-approved wording replaces those placeholders and the opt-in page is deployed.
