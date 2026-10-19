# Security

Firestore rules start from a deny-all match. Staff reads are then allowed per collection. Client writes are denied. Cloud Functions use the Admin SDK, which bypasses rules, and those functions check the staff role before they change a campaign, a template, a reward, an invite, or coverage.

Collections clients cannot read: `webhookEvents`, `rateLimits`.

`auditEvents` and `reconciliationReports` are readable by Admin and Ops. They are not writable by clients.

App Check is required on public signup and quote requests when the Cloud Functions runtime sets `K_SERVICE`, unless `APP_CHECK_ENFORCE=false`. The provider and site key are not chosen. The signup and quote forms also reject a filled honeypot field and a submit that arrives in under 800 milliseconds.

Function instances are capped at 10 in `functions/src/index.ts`. That number is a safety cap, not a traffic plan.

The browser Firebase API key belongs in `VITE_FIREBASE_API_KEY` at build time. After a project and domain exist, restrict that key to the domain and to the Firebase APIs the staff portal uses. Do not commit the key.

Secrets named `GHL_PRIVATE_INTEGRATION_TOKEN`, `GHL_CLIENT_SECRET`, `GHL_REFRESH_TOKEN`, and `GHL_WEBHOOK_PUBLIC_KEY` are bound with `defineSecret` for Secret Manager.

Text consent stores the wording and the time on the referrer and on the referral. The wording shipped in the repo is a placeholder.

Staff sign-in in production is Firebase Authentication. The local server in `server/local.ts` is a development process. It is not the production auth path.
