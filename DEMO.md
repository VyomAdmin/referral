# NuVision Referral Platform — Interactive Demo Script

Source for building a clickable/interactive demo asset (walkthrough deck, Loom script, or HTML prototype).
Reflects test-mode build state as of 2026-08-14 — Stages 1-5 complete, no live integrations. See `TEST_MODE.md` for QA details.

## 1. One-line pitch

First-party, white-label replacement for Referral Factory: NuVision owns referral attribution, ZIP/state routing, tracking, rewards, and the HubSpot sync boundary in-house.

## 2. Cast of characters (personas to demo)

| Persona | Goal | Entry point |
|---|---|---|
| Referrer (NuVision customer) | Register, get a shareable link, track referral status | `/` |
| Referred customer | Enter ZIP, see offer, submit quote request, track progress | `/r/NV-NUVISION` |
| Internal ops user | Search people, view timeline, approve rewards | `/admin` |

## 3. Demo flow (~6-8 min walkthrough)

### Scene 1 — Referrer registers
- Go to `/` → fill first name, last name, email, phone → submit.
- Show: unique permanent referral link generated + share actions (copy/SMS/email style buttons).
- Talking point: one link per referrer, reusable forever, no login needed later — tracker access is passwordless.

### Scene 2 — Referred customer journey (Arizona — has offer)
- Open the generated link, or use seeded `/r/NV-NUVISION`.
- Enter ZIP `85001` (Arizona) → offer page shows **$50 customer + $50 referrer** offer, AZ-specific copy.
- Fill quote form: name, email, phone, vehicle make/year/model, insurance provider → submit → confirmation screen.
- Talking point: ZIP gate happens *before* offer language — attribution (referral code, ZIP, state, campaign) is preserved silently through the whole flow.

### Scene 3 — Same journey, no-offer state (Florida)
- Repeat with ZIP `33101` (Florida) → show FL-specific messaging with **no customer offer**, proving state-by-state config isn't hardcoded per-offer logic.

### Scene 4 — Referrer tracker
- Go to `/track/referrer/demo`.
- Show privacy-safe view: counts of referrals by stage, no PII of referred customers exposed.

### Scene 5 — Customer tracker (the 4-stage promise)
- Go to `/track/customer/demo`.
- Walk the four public stages: **Referral received → Appointment scheduled → Installation completed → Reward paid.**
- Also open `/track/customer/expired` to show the secure-token failure state (expired/invalid link handling).

### Scene 6 — Internal operations portal
- Go to `/admin`.
- Overview metrics → global search (search by referrer, customer, phone, email, HubSpot ID, or deal ID — one box, all entities).
- Open a referral detail → full timeline, HubSpot sync status indicator.
- Open Rewards queue → attempt to mark a "Closed Won, not yet installed" referral as paid → show it's **blocked**.
- Talking point (the key invariant): reward eligibility requires `Closed Won AND installation_completed=true AND installation_completed_at set AND not rejected/cancelled/duplicated`. Closed Won alone never unlocks payment — this is enforced in code and covered by tests, not a UI-only guard.

### Scene 7 — Test-mode transparency
- Point out the persistent "Test mode" banner visible on every screen.
- State plainly what's real vs. simulated (see table below) — this is the credibility moment with stakeholders.

## 4. What's real vs. simulated right now

| Area | Status |
|---|---|
| UI/UX, branding, all screens | Real, final-quality |
| ZIP→state routing, offer logic | Real |
| Reward eligibility rule | Real, enforced + tested |
| Referrer/customer submissions | Simulated — browser storage only, not persisted server-side yet |
| Admin dashboard data | Seeded demo records |
| HubSpot sync | Boundary/webhook code exists (signature validation, idempotency, mapping) but disconnected — no live secret configured |
| Emails | Preview-only, no send provider connected |
| Reward payout | UI action only, no money moves |
| `/admin` auth | None yet — pre-production |

## 5. Test URLs / seeded data cheat sheet

- Referrer registration: `/`
- Referred customer flow: `/r/NV-NUVISION`
- Arizona ZIP (has offer): `85001`
- Florida ZIP (no offer): `33101`
- Referrer tracker: `/track/referrer/demo`
- Customer tracker: `/track/customer/demo`
- Expired tracker link: `/track/customer/expired`
- Internal ops: `/admin`

## 6. Anticipated stakeholder questions

- **"Is this connected to HubSpot yet?"** No — boundary code is built and tested, needs a live private-app/OAuth secret and confirmed pipeline/stage IDs.
- **"Can someone get paid without installation?"** No — hard-blocked by the reward-eligibility invariant, this is the one rule the build treats as non-negotiable.
- **"When can we go live?"** After: D1-backed persistence replaces browser storage, admin auth is added, HubSpot + email providers are connected, and a payout method is chosen. See `BUILD.md` remaining checklist.

## 7. Suggested interactive-asset format

Build as a linear clickable walkthrough (7 scenes above = 7 slides/screens), each with:
1. A screenshot or embedded live screen of the app state.
2. The one talking point from that scene.
3. A "Try it" link/button to the actual route for live-poking during the demo.
