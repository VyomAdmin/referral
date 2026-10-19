# GoHighLevel setup

This repository does not have access to a GoHighLevel account. Nothing here is connected, and nothing has been verified against a live location.

Checked against HighLevel's public docs on 2026-10-19:

- Webhook integration guide: https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide
- Opportunity stage webhook: https://marketplace.gohighlevel.com/docs/webhook/OpportunityStageUpdate
- Outbound message webhook: https://marketplace.gohighlevel.com/docs/webhook/OutboundMessage
- Email stats webhook: https://marketplace.gohighlevel.com/docs/webhook/LCEmailStats
- Identity Platform TOTP is a separate product and is documented in `OPEN_QUESTIONS.md`

## Account shape

Use one sub-account and one pipeline. The pipeline stages, in order, are:

1. New referral
2. Appointment booked
3. Install scheduled
4. Install complete
5. Lost

Ops moves opportunities. The app does not move them.

## Contact fields and tags

Create contact custom fields for: referral code, Firestore referral ID, Firestore referrer ID, state, ZIP, and vehicle.

The field IDs are account-specific. Put them in `GHL_CUSTOM_FIELD_IDS` as JSON. Until those IDs are set, the adapter still sends the contact's name, email, phone, and tags, and it omits the custom fields.

Tags used by the adapter: `referrer` and `referred`.

## Workflows

Create these four workflows in the sub-account. The app does not create them.

1. Welcome when a contact is tagged `referrer`.
2. Confirmation when a contact is tagged `referred` and an opportunity is created.
3. Thank-you when an opportunity enters Install complete.
4. Stage change: subscribe the marketplace webhook to `OpportunityStageUpdate` and point it at `/api/webhooks/ghl`.

Customer-facing workflow messages must not include the referrer reward amount. The portal rejects a customer template that contains a dollar amount.

The stage webhook payload published by HighLevel includes `pipelineStageId` and does not include the stage name. Either:

- set `GHL_STAGE_IDS` to a JSON object whose keys are `new_referral`, `appointment_booked`, `install_scheduled`, `install_complete`, and `lost`, or
- send a body that also includes `stageName` set to one of the five labels above, plus a unique `webhookId`.

If neither is present, the handler stores the event and does not change the referral stage.

## Signature

HighLevel's current marketplace guide signs the raw body with Ed25519 and sends the signature in `X-GHL-Signature`. Verification uses the public key from that guide, supplied at runtime as `GHL_WEBHOOK_PUBLIC_KEY`. The code does not embed the key.

The same guide says the older `X-WH-Signature` RSA header was scheduled to stop on 2026-09-01. This code does not accept that header.

An earlier note described HMAC-SHA256 in `X-GHL-Signature`. That is not what the guide above describes. The handler uses Ed25519 verification on the raw bytes. It returns 503 when the public key is unset and 401 when the signature does not verify. Events already stored in `webhookEvents` are not applied again.

A workflow "custom webhook" action is not the same thing as a marketplace subscription. This repo does not have a published signing method for that action. Use the marketplace subscription, which the guide says is signed.

## Auth

The adapter uses a private integration token when `GHL_PRIVATE_INTEGRATION_TOKEN` is set. Otherwise it uses OAuth refresh when `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, and `GHL_REFRESH_TOKEN` are all set. If neither is set, CRM and messaging calls are skipped, the referral stays `syncPending`, and the user-facing request still succeeds.

Whether a private token can cover contacts, opportunities, conversations, and webhooks for this account is not known. See `OPEN_QUESTIONS.md`.

Store the token, client secret, refresh token, and webhook public key in Secret Manager. The function declarations bind those four names. Do not commit them.

## Calls

All CRM and message calls go through `GhlClient` in `functions/src/ghl.ts`. The base URL defaults to `https://services.leadconnectorhq.com` and can be overridden with `GHL_API_BASE`. Set `GHL_API_VERSION` to the Version header the account expects. It is not hard-coded.

HTTP 429 is retried with the `Retry-After` header when that header is a number, otherwise with exponential backoff, up to four attempts. Failed referral and referrer syncs stay `syncPending`. `retryCrmSync` runs every 60 minutes and tries them again.

`nightlyReconcile` runs at 06:00 UTC. It reads each referral that has an opportunity id, asks the CRM for the stage, and writes a `reconciliationReports` document listing mismatches. It does not overwrite Firestore stages.

## Message events

`OutboundMessage` (email) and `LCEmailStats` are documented marketplace events. When a verified webhook of either type arrives, the handler stores a `messageEvents` row and the staff email page lists the email rows. Subscribing to those events is an account setting. This repo has not subscribed to anything.

## What is not done

No location, pipeline, token, workflow, or webhook subscription has been created from this repository.
