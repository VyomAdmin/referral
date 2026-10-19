# Agent handoff

Read `README.md`, `OPEN_QUESTIONS.md`, `docs/ghl-setup.md`, and `docs/security.md` before changing the app.

The public site is `web/`. Server behavior is `functions/src/handlers.ts`. Firestore access for production is `functions/src/firestore-store.ts`. Security rules are `firestore.rules`. Brand and campaign values are read in `config/site.ts`.

Do not add a company name, a domain, a reward amount, or a ZIP code to the source. Do not call a deployed environment. CRM and messaging failures must not fail signup or quote; they leave `syncPending` set.

A reward becomes eligible only at Install complete, only when the referral is not a self-referral, and only when no reward exists yet. Marking it paid records the staff user, the time, and an audit event.

Customer-facing copy must not include the referrer reward. The quote response and the customer tracking response omit it.
