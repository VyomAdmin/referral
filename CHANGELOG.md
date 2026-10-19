# Changelog

The tree at `0309f55` was a vinext app for NuVision auto glass. It used PostgreSQL, HubSpot, Brevo, Gmail SMTP, and Twilio, and it had separate Arizona and Florida campaign copy. Those products and that brand are removed. The replacement reads the company, domain, and sender from `config/site.ts` and the environment, stores data in Firestore, and talks to GoHighLevel only from Cloud Functions. No integration in this branch is live.
