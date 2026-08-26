# NuVision Referral Platform — Team Walkthrough

Quick orientation for a teammate new to the app. For full history see `AGENT_HANDOFF.md` / `BUILD.md`; this is the short version.

## What it is
- In-house, white-label replacement for Referral Factory.
- Owns: referral attribution, ZIP/state routing, tracking, reward eligibility, HubSpot sync boundary.
- Stack: Next.js/vinext + Postgres/Drizzle, deployed on AWS App Runner.
- Live URL: `https://uykwpxswmu.us-east-1.awsapprunner.com`

## Current status (as of 2026-08-19)
- **Real DB persistence — done.** No more localStorage/demo arrays; referrer signup, referral submission, admin dashboard, and both tracker pages read/write real Postgres rows.
- **Not yet live:** HubSpot connection (code built, no secret configured), transactional email sending, reward payout automation, `/admin` auth (pre-production — no login gate).
- **Supported states:** Arizona and Florida only.

## Three personas to walk through

| Persona | Route | What to show |
|---|---|---|
| Referrer | `/` | Register → get a permanent, reusable, passwordless referral link |
| Referred customer | `/r/<code>` | Enter ZIP → offer (or no-offer) page → quote form → confirmation |
| Internal ops | `/admin` | Global search, referral timeline, rewards queue |

## Suggested walkthrough flow (~10 min)
1. **Referrer signup** at `/` — fill form, get the generated link.
2. **Customer journey, AZ** — open the link (or seeded `/r/NV-NUVISION`), ZIP `85001` → $50/$50 offer → submit quote.
3. **Customer journey, FL** — same flow, ZIP `33101` → no offer, proving state config isn't hardcoded.
4. **Referrer tracker** at `/track/referrer/<token>` — privacy-safe, counts only, no referred-customer PII.
5. **Customer tracker** at `/track/customer/<token>` — the 4 public stages: Referral received → Appointment scheduled → Installation completed → Reward paid.
6. **Admin** at `/admin` — search by referrer/customer/phone/email/HubSpot ID/deal ID; open a referral's timeline; try marking a "Closed Won, not installed" reward as paid — it's **blocked**.

## The one invariant that matters
Reward eligibility requires **Closed Won AND installation_completed=true AND installation_completed_at set AND not rejected/cancelled/duplicated.** Closed Won alone never unlocks payment. This is enforced in code (`app/lib/admin-rules.ts`) and covered by tests — don't let anyone "fix" it as a UI-only guard.

## Access
- Admin login: `admin@nuvisionautoglass.com` (password in `~/.admin-password-nuvision-referral.txt`).
- No auth gate on `/admin` yet — anyone with the URL can reach it. Don't share the URL outside the team until auth ships.

## What to say if asked
- **"Connected to HubSpot?"** No — boundary code (signature validation, idempotency, mapping) is built and tested, needs a live secret + confirmed pipeline/stage IDs.
- **"Can someone get paid without installation?"** No — hard-blocked by the invariant above.
- **"When's it live for real customers?"** After HubSpot + email provider are connected, `/admin` gets auth, and a payout method is chosen.
