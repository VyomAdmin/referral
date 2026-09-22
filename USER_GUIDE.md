---
title: NuVision Referral Platform — User Guide
audience: [referrer, referred-customer, staff]
version: 1.0
last_reviewed: 2026-09-22
purpose: Source content for an interactive training document
---

# NuVision Referral Platform — User Guide

This guide covers every person who touches the platform: the **referrer** who shares a link, the **referred customer** who books a service, and the **NuVision staff** who run the program.

**How to use this document for training:** Modules 1–3 are the public experience (short — staff should know these so they can answer questions). Modules 4–12 are the staff operations portal and carry the bulk of the training. Each module opens with who it is for and what you will be able to do, and closes with a knowledge check.

---

## Quick reference

| Thing | Where |
|---|---|
| Public referral site | `https://referrals.nuvisionautoglass.com` |
| Referrer signup | `/` |
| A referrer's share link | `/r/<their-code>` — e.g. `/r/NV-MA-5373` |
| Find my tracker | `/track` |
| Program terms | `/terms` |
| Staff operations portal | `/admin` |
| Staff sign-in | `/admin/login` |

**Live markets:** Arizona and Florida only.

| | Arizona | Florida |
|---|---|---|
| ZIP range | 850–865 | 320–349 |
| Referrer reward | $50 | $50 |
| Customer offer | $50 cash back with insurance, or $50 off a cash payment | None |
| How the referrer is paid | Amazon, Walmart, Target or Starbucks voucher — **or** ACH, PayPal, Venmo | Voucher only |

---

# PART A — The public experience

## Module 1 — The referrer journey

**Who this is for:** Everyone. Staff need it to answer customer questions.
**You will be able to:** Explain how someone joins, what they receive, and how they track progress.

### 1.1 Signing up

A referrer goes to the site and completes four fields plus a consent tick:

- First name
- Last name
- Email address
- Mobile number
- **Consent checkbox** (required) — links out to the program terms and privacy policy

They press **Create my link**.

> **Why the consent tick matters:** The system stores the exact wording that was on screen, the timestamp, and the IP address against that referrer. This is a deliberate legal record — the terms will be reworded over time, and "they agreed to whatever the page says today" is not defensible in a dispute.

### 1.2 What they get back

Immediately on screen:

- **A permanent referral link** — `referrals.nuvisionautoglass.com/r/NV-XX-####`. The code uses their initials plus four digits. It never expires.
- **A copy button** and three share shortcuts: **Text**, **Email**, **WhatsApp** — each pre-filled with: *"NuVision took great care of my windshield. Use my referral link to get started:"*
- **A "Track referrals" link** to their personal tracker.

They also receive a **welcome email and a welcome SMS**.

> **Signing up twice does nothing bad.** If someone registers again with the same email, they get their *original* code back and no second account is created. This is intentional — one person, one code, so their credit never splits.

### 1.3 Tracking their referrals

Their tracker (`/track/referrer/<token>`) shows:

- Their referral link with a copy button and a **Preview** link to see what friends see
- **Total referrals**, **Installed** (with a conversion %), **Rewards earned** (paid rewards only)
- A searchable list of everyone they referred, with each person's current stage

Privacy: the referrer sees referred people as first name plus last initial only.

### 1.4 If they lose the link

They go to `/track` and enter the **email and phone number on file**. The system brings up their tracker — and any service requests of their own. Tracker links expire after 90 days; this is how they get a fresh one.

**Knowledge check**
1. A referrer says they signed up twice by accident and worries their referrals are split across two codes. What do you tell them?
2. Why does the referrer only see "Sarah M." instead of the full name of the person they referred?
3. A referrer's tracking link stopped working. What is the one thing they need to do?

---

## Module 2 — The referred customer journey

**Who this is for:** Everyone.
**You will be able to:** Walk a customer through the form and explain what happens after they submit.

The friend opens `/r/<code>` and sees a page naming the referrer who sent them.

### Step 1 of 2 — ZIP code

They enter a five-digit ZIP. This is what selects the state, the offer, the messaging, and the terms.

- **Serviceable ZIP** → the state-specific offer appears and the form opens.
- **Non-serviceable ZIP** → a polite stop: we don't serve that ZIP, the area has been noted, and the only option offered is correcting a mistyped ZIP.

> **This is deliberate and must not be "helpfully" worked around.** There is no phone number and no quote handoff on that screen. The attempt *is* recorded so the business can see real demand outside the service area, but an unserved area is not a lead — a pipeline record would create a follow-up obligation nobody can honour.

### Step 2 of 2 — Vehicle and contact

| Field | Required? |
|---|---|
| Full name | Yes |
| Email | Yes |
| Mobile number | Yes |
| Vehicle make | Yes — dropdown, with "Other" for free text |
| Year | Yes — dropdown |
| Model | Yes — dropdown that depends on the make |
| Insurance provider | **Optional** |
| Consent | Yes |

They press **Request my quote**.

### After submitting

- A confirmation screen: *"You're in good hands, [first name]"* — telling them a NuVision specialist calls **within one business hour** to confirm the glass and verify insurance coverage.
- A **Track my service** link.
- A confirmation **email and SMS**.
- Behind the scenes: a HubSpot contact and deal are created, and the referrer is notified that their referral came in.

### The customer's tracker

Shows **three** stages only — Referral received → Appointment scheduled → Installation completed. The customer never sees the referrer's reward stage.

> **A referrer cannot refer themselves.** If the email or phone matches the referrer's own, the form is blocked with a message telling them to share the link with a friend instead. This happens by accident more than by fraud.

**Knowledge check**
1. A customer in an unserved ZIP asks for a phone number to call. What does the screen offer them, and why?
2. Which field on the customer form is optional?
3. Why does the customer's tracker show three stages when the referrer's shows four?

---

## Module 3 — The four stages

**Who this is for:** Everyone. This vocabulary is used throughout the staff portal.

| Stage | Meaning | What moves it |
|---|---|---|
| **Referral received** | The request reached NuVision | The customer submitting the form |
| **Appointment scheduled** | Service is on the calendar | HubSpot deal stage change — **automatic** |
| **Installation completed** | The glass installation is done | HubSpot install-completed signal — **automatic** |
| **Reward paid** | The referral reward was processed | A staff member clicking **Mark paid** — **manual** |

**Two rules worth memorising:**

1. **Status never goes backwards.** If someone corrects a HubSpot deal stage to an earlier value, the customer-facing status stays where it was. Customers are never told their install was un-installed.
2. **Closed Won alone never unlocks payment.** A reward requires the installation-completed signal *and* a recorded completion timestamp. This is enforced on the server, not just by greying out a button.

**Knowledge check**
1. Three of the four stages move on their own. Which one does not?
2. A deal shows Closed Won in HubSpot. Can the reward be paid?

---

# PART B — The staff operations portal

## Module 4 — Getting in

**Who this is for:** All staff.
**You will be able to:** Sign in, accept an invitation, and turn on two-factor authentication.

### Signing in

Go to `/admin`. You will be redirected to `/admin/login`. Three fields:

- **Email**
- **Password**
- **Authentication code** — a 6-digit code, only if you have enrolled in two-factor

Every sign-in — success, wrong password, wrong 2FA code — is written to the audit log.

### Accepting an invitation

You receive an invite link. Open it, set a password (**minimum 8 characters**), and you are signed in automatically. **Invitations expire after 7 days.** If yours has expired, ask an admin to re-send it.

### Turning on two-factor authentication

**Settings → Security → Two-factor authentication.** Scan the QR code with your authenticator app, enter the 6-digit code to confirm. From then on you'll be asked for a code at every sign-in.

> 2FA is per-user and opt-in. Anyone handling rewards or customer data should enable it.

### Signing out

**Settings → Security → Session → Sign out.**

**Knowledge check**
1. Where do you enable two-factor authentication?
2. An invite you sent last week doesn't work. Why, and what do you do?

---

## Module 5 — Finding your way around

**Who this is for:** All staff.

Nine sections in the left sidebar:

| Section | What it's for |
|---|---|
| **Overview** | Daily dashboard — metrics, funnel, what needs attention |
| **Referrals & people** | Search and inspect every referral |
| **Campaigns & states** | Offers, reward amounts, pause/activate |
| **Message templates** | Custom referrer emails and texts |
| **Rewards** | The payment queue |
| **Emails** | Delivery and open tracking |
| **Analytics** | Volume and conversion trends |
| **Integrations** | Are HubSpot, email, and SMS actually connected? |
| **Settings** | Team members, roles, your own security |

Each section has its own web address (`/admin/rewards`, `/admin/referrals`) so you can bookmark it, and browser back/forward moves between sections.

---

## Module 6 — Roles and what each can do

**Who this is for:** Owners and Company admins assigning access; everyone else to understand their limits.

| Role | Scope |
|---|---|
| **Owner** | Everything. Cannot be assigned — it exists from setup. |
| **Company admin** | Everything, including team management |
| **CRM Operations** | Customers, referrals, HubSpot sync, timelines |
| **Rewards & Finance** | Eligibility review and payout status |
| **Marketing** | Campaigns, offers, and message templates |

### Permission matrix

| Action | Owner | Company admin | CRM Ops | Rewards & Finance | Marketing |
|---|:--:|:--:|:--:|:--:|:--:|
| View all sections | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark a reward paid | ✅ | ✅ | ❌ | ✅ | ❌ |
| Retry HubSpot sync | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit a customer's contact details | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create/edit message templates | ✅ | ✅ | ❌ | ❌ | ✅ |
| Invite teammates | ✅ | ✅ | ❌ | ❌ | ❌ |

> **Note:** editing a campaign (including the reward amount) is currently available to any signed-in staff member regardless of role. Treat campaign edits as a change that should be agreed before it is made.

**Every change is logged.** Marking paid, editing contacts, activating templates, inviting users — each writes an audit record with who did it and when.

**Knowledge check**
1. You are CRM Operations. A referrer's reward is eligible. Can you pay it?
2. Which two roles can invite a new teammate?

---

## Module 7 — Overview (your daily dashboard)

**Who this is for:** All staff.
**You will be able to:** Read the dashboard and act on what it flags.

### The four tiles

- **Active referrers** — total, plus how many joined this month
- **Referral forms** — total submitted, plus how many are installation-qualified
- **Installed** — count and form-to-install rate
- **Rewards outstanding** — dollars owed, plus dollars paid all time

### Referral funnel

Forms submitted → Appointments → Installations → Rewards paid.

### Needs attention

Appears only when there is something to do:

- **Rewards await payment** — with the age of the oldest eligible one
- **HubSpot syncs pending** — with a **Retry** button
- **Teammate invitations** waiting for acceptance

There is also a **Sync with HubSpot** button that retries every pending sync at once.

> **Recommended daily routine:** open Overview → clear anything in *Needs attention* → check *Rewards outstanding* isn't ageing.

---

## Module 8 — Referrals & people

**Who this is for:** CRM Operations, admins.
**You will be able to:** Find any referral and work the detail drawer.

### Searching

One search box matches across: referral ID, referral code, referrer name, referrer email, customer name, customer email, phone, ZIP, state, and HubSpot deal ID.

Two filters: **state** (AZ / FL) and **status**. Results page 10 at a time.

> The status filter includes *Cancelled*, but nothing in the app currently sets that status — you will never see results under it.

### The detail drawer

Click any row. You get:

- **Status** and **HubSpot sync state**
- **People** — referrer → customer
- **Referral details** — code, market, HubSpot deal and stage, installation date, reward amount. Once paid, also **who** paid it and **when**.
- **Timeline** — the four stages with their timestamps
- **Copy tracker link** — generates a fresh customer tracker link to send someone
- **Mark $X paid** — disabled until eligible

### When a sync has failed

A failed sync shows the error and two options:

1. **Retry as-is** — for a transient failure
2. **Edit contact & retry** — correct first name, last name, email, or phone, then re-sync

Use option 2 when the failure was caused by bad contact data — a typo'd email, for example.

**Knowledge check**
1. A referrer calls asking about a friend but only remembers a phone number. Can you find the referral?
2. A sync failed with an invalid-email error. Which of the two retry options do you use?

---

## Module 9 — Rewards

**Who this is for:** Rewards & Finance, admins.
**You will be able to:** Work the reward queue correctly.

### The three totals

- **Eligible now** — installation confirmed, awaiting payment
- **Paid all time**
- **Blocked / pending install** — referrals not yet installed

### Paying a reward

1. Go to **Rewards**
2. Find the referral — search or filter by status
3. If eligible, the button reads **Mark $50 paid**. If not, it reads **Waiting for installation** and is disabled.
4. Click it. The referral moves to *Reward paid*, your name and the timestamp are recorded, an audit entry is written, and the referrer receives a "reward paid" notification.

> ### Read this before using this screen
>
> **"Mark paid" records a payment — it does not make one.** No money moves. The actual voucher or transfer is arranged outside this system. Only click it *after* the referrer has genuinely been paid, or your records will say someone was paid when they were not.
>
> **There is no undo.** There is no way to reverse a payment, issue a partial reward, or claw one back in the app.

### Why a reward can be blocked

Payment unlocks only when the referral is at *Installation completed* **with a recorded completion timestamp**. A deal marked Closed Won in HubSpot is not enough. If a reward looks stuck, check the install-completed signal in HubSpot first.

**Knowledge check**
1. What actually happens when you click "Mark $50 paid"?
2. A referral shows Closed Won in HubSpot but the pay button is disabled. What do you check?
3. You marked the wrong referral as paid. What are your options in the app?

---

## Module 10 — Campaigns & states

**Who this is for:** Marketing, admins.

One card per state. Each shows status (Active/Paused), the customer offer, the referrer reward, forms submitted, and ZIP routing.

**Edit campaign** lets you change:

- Campaign name
- Customer offer (leave blank for none — this is how Florida is set up)
- Referrer reward in dollars
- Active / paused

> **Changing the reward amount affects future payouts.** Referrals already in the queue keep the amount in force when they were created. Agree changes before making them — the edit is available to any signed-in staff member.

Adding a new state is a code change, not a settings change. Raise it with engineering.

---

## Module 11 — Message templates

**Who this is for:** Marketing, admins.
**You will be able to:** Write, activate, and safely manage custom referrer messages.

### How it works

Six referrer notifications exist with built-in default copy:

| Template key | Sends when |
|---|---|
| `referrer_welcome` | They sign up |
| `referral_received` | Someone uses their link |
| `appointment_scheduled` | The appointment is booked |
| `installation_completed` | The install is done |
| `reward_earned` | *(see caution below)* |
| `reward_paid` | Staff mark the reward paid |

A template you create **overrides** the default for one specific notification, for one specific campaign. Everything you create starts as a **Draft** and sends nothing until you **Activate** it.

### Creating one

1. **Message templates** → pick a campaign → **+ New** under Email or SMS
2. **Replaces which email** — required. This is the notification your template takes over.
3. **Internal name** — e.g. "AZ referrer — spring promo"
4. **Subject** and **Body (HTML)**, plus optional plain-text version. SMS has a single message field with a live character and segment count.
5. **Save as draft**, then **Activate** when ready

### Available tokens

```
{{first_name}}  {{referrer_name}}  {{referral_link}}
{{campaign_name}}  {{state_name}}  {{reward_amount}}
```

An unrecognised token is left visible in the message rather than silently blanked — so a mistake is obvious rather than reaching a customer as a gap mid-sentence.

> ### Two cautions
>
> **1. Always set "Replaces which email".** Leaving it unset means the template overrides nothing and sends to nobody. A past incident sent a "your $50 reward is ready!" message to people who had just signed up, because a template wasn't scoped to a specific notification.
>
> **2. Activating one template currently deactivates the other active templates for that campaign.** If you activate a `reward_paid` template, a previously active `referrer_welcome` template for that campaign will switch back to draft. **After activating anything, check the other templates in that campaign are still Active.** This is a known defect and is being fixed.
>
> **Also note:** `reward_earned` appears in the picker but does not currently fire — no message is sent at that point in the journey. Don't build a campaign that depends on it.

Active templates cannot be deleted. Activate a different one first.

**Knowledge check**
1. You created a template and saved it. Is it sending?
2. You just activated a new SMS template for Arizona. What must you check immediately afterwards?
3. What happens if you misspell a token as `{{firstname}}`?

---

## Module 12 — Emails, Analytics, Integrations

**Who this is for:** All staff.

### Emails

Four tiles — **Delivered**, **Opened**, **Tracker clicks**, **Bounced** — each as a count and a percentage, over a table of every message with recipient, template, referral, status, and send time.

> Delivery and open tracking only work on the Brevo provider. Older records may sit permanently at "sent" — that is a historical limitation, not a fault.

### Analytics

- **Monthly volume** — forms vs installations over six months
- **Installation conversion by market** — AZ vs FL

> Analytics covers what happens *after* a form is submitted. It does not yet show link clicks or sharing activity.

### Integrations

A live health check on three services. Each shows **Live** or **Not configured**:

- **HubSpot CRM** — CRM writes, webhook endpoint
- **Transactional email** — provider in use and whether delivery tracking is on
- **SMS (Twilio)** — live sending status

**Check this page first when messages aren't arriving or referrals aren't reaching HubSpot.**

---

# PART C — Reference

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Referrer says their tracker link is dead | Links expire after 90 days | Send them to `/track` to look it up with email + phone |
| Tracker asks for details and rejects them | Email or last-4 phone don't match the record | Check the record in **Referrals & people**; verify you have the right email |
| "Too many attempts" on a tracker | Rate limit — 5 tries per 15 minutes | Wait a few minutes. The window clears after the last *allowed* attempt |
| Customer says the form rejected them | Self-referral block — their email or phone matches the referrer's | They cannot refer themselves; they should book a quote normally |
| Referral not in HubSpot | Sync failed | Open the drawer → check the error → **Retry as-is** or **Edit contact & retry** |
| Reward won't pay | No install-completed signal | Confirm installation completion in HubSpot; Closed Won is not enough |
| Emails not sending | Provider not configured | Check **Integrations** |
| A referrer has two codes | Legacy duplicate from before one-code-per-email | Escalate — do not create more; confirm which code is on their shared link |
| Customer booked by phone, no referral recorded | Only referrals through the link are tracked | There is no way to attribute this after the fact. Explain the link requirement |

## Known limitations

Be honest with customers and colleagues about these:

- **Referrals must travel through the link.** If a friend calls the shop directly, there is no reward and no record. This is a program rule, stated on the referrer's landing page.
- **Paying a reward is a manual, external step.** The app records it; it does not transfer money.
- **There is no way to cancel, reject, or reverse** a referral or a payment.
- **No data export** from the portal.
- **No manual referral creation** — staff cannot add a referral or re-assign one to a different referrer.
- **No automatic reminders.** Referrers who go quiet are never nudged.
- Arizona and Florida only; new states require a code change.

## Glossary

| Term | Meaning |
|---|---|
| **Referrer** | An existing customer who shares their link |
| **Referred customer / referee** | The friend who books via the link |
| **Referral code** | `NV-XX-####`, initials plus four digits — permanent |
| **Campaign** | A state's configuration: offer, reward, messaging, ZIP routing |
| **Public status** | The four customer-facing stages |
| **Sync status** | Whether the referral reached HubSpot: pending, synced, failed, skipped |
| **Tracker token** | The expiring key in a tracker URL — 90 days |
| **Template key** | Which notification a custom template replaces |
| **Eligible** | Installation completed and timestamped — the reward may be paid |
| **Audit log** | The permanent record of who changed what |

## Answers to knowledge checks

**Module 1** — 1. Nothing is split; a repeat signup returns the original code and creates no second account. 2. Privacy — referrers see first name and last initial only. 3. Go to `/track` and enter the email and phone on file.

**Module 2** — 1. Only the option to correct a mistyped ZIP. We don't create a follow-up obligation in an area we can't serve. 2. Insurance provider. 3. The reward stage is the referrer's business, not the customer's.

**Module 3** — 1. Reward paid — it is always a manual staff action. 2. No. It needs the installation-completed signal and timestamp.

**Module 4** — 1. Settings → Security. 2. Invitations expire after 7 days; ask an admin to re-send.

**Module 6** — 1. No — paying requires Owner, Company admin, or Rewards & Finance. 2. Owner and Company admin.

**Module 8** — 1. Yes — search matches phone numbers. 2. **Edit contact & retry**, because the data itself is wrong.

**Module 9** — 1. It records the payment, logs who and when, and notifies the referrer — no money moves. 2. Whether the installation-completed signal has reached the record. 3. None in the app; escalate immediately.

**Module 11** — 1. No — new templates are drafts until activated. 2. That the campaign's other templates are still Active. 3. It appears literally as `{{firstname}}` in the message.
