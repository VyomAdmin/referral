# NuVision Referral Cutover — Session Log

**Project:** nv-claude
**First review:** 4 September 2026
**Re-checked:** 7 September 2026
**Method:** live browser testing + HubSpot API reads. Read-only — no data was written to any live system.
**Live report:** the "Referral Cutover Audit" artifact (status column, updated as items close)

---

## 1. What this is about

NuVision runs its referral program on **Referral Factory**, with two separate campaigns:

| | Link |
|---|---|
| Arizona | `https://nuvision-auto-glass.referral-factory.com/7ztxOB` |
| Florida | `https://nuvision-auto-glass.referral-factory.com/cPXcHGVa` |

FAQ pages live on the WordPress site, not on Referral Factory:

- `https://www.nuvisionautoglass.com/referral-program-faq/` (AZ)
- `https://www.nuvisionautoglass.com/referral-program-faq-florida/` (FL)

A new in-house app is replacing it: **`https://referrals.nuvisionautoglass.com`**. One link for both states, state chosen by the referred friend's ZIP. Data goes straight to HubSpot by API — no Zapier.

**Offers, for reference:**

| State | Referrer | Customer |
|---|---|---|
| Arizona | $50 — vouchers (Amazon / Walmart / Target / Starbucks) **or** bank transfer (ACH / PayPal / Venmo) | $50 extra cash back with insurance, or $50 off cash |
| Florida | $50 — vouchers only | No customer offer |

---

## 2. Current position

**24 completed · 20 pending · 3 blockers left**

The app has improved a lot. The WordPress main site has not been touched at all — verified on production **and** staging with the cache bypassed.

---

## 3. Blockers still open

| ID | Item | Detail |
|---|---|---|
| **B‑03** | Referrer never reaches HubSpot | `referral_code__c`, `referralcode`, `referred_by`, `referral_email__c`, `referral_phone__c` all empty. No referrer contact is created. HubSpot cannot say who is owed $50 |
| **B‑04** | GTM events missing | Container `GTM-5HRL52B` and GA4 `G-SSJ8CWLWZ8` are live, but `dataLayer` only holds `gtm.js / dom / load / scrollDepth`. No referral events |
| **B‑08** | "Track my referrals" link is wrong | In the "A referral just came in" email it opens `/r/<code>` — the *referred friend's* page — instead of `/track`. The referrer can submit themselves as their own referred customer |

---

## 4. Everything verified DONE

**On the referral app:**

- Invalid referral code blocked — `/r/ZZZZ-NOTREAL` shows "This referral link isn't valid." with a Get-a-quote link
- ZIP hardened — `required`, `pattern=\d{5}`, min and max length 5. `8500199999` no longer routes to Arizona
- `robots.txt` live: Disallow `/admin`, `/demo`, `/track`, `/r/`
- Public `/admin` and `/demo` links removed from the homepage
- `/admin` is properly protected — a logged-out request redirects to `/admin/login` and leaks no records
- Every form field now has `id` + `name` + `required`
- Per-field error messages with `aria-invalid` ("Enter your full name.")
- Vehicle make (55 options) and year (34) are selects; model becomes a select after a make is chosen (54 Toyota models) — the full cars.json cascade
- **Insurance list matches production exactly** — 94 entries, same order, same spelling, joined string identical at 1187 characters
- Phone number added: "Call 1855-213-0100" with a `tel:` link
- Four trust blocks added: $0 with insurance, same-day mobile, lifetime warranty, OEM glass & ADAS
- Dev helper text "Try 85001 for Arizona or 33101 for Florida." removed
- Consent links to Program Terms + Privacy Policy, with full TCPA wording: "Message and data rates may apply; message frequency varies. Reply STOP to opt out."
- Email moved from **Gmail SMTP app password → Brevo (API) with delivery webhooks**
- Admin sub-routes now real: `/admin/templates`, `/admin/integrations`, `/admin/rewards` etc.
- Florida's negative line "No additional customer offer is active in Florida." removed
- `/terms` page created (version 2026-09-06)
- Referrer's real name now shows — `/r/NV-TT-5343` reads "A personal referral from TEST1212"
- Thank-you page confirmed — referral ID, ZIP and state, status, three next steps, phone, Track button
- Test data cleared from live HubSpot
- Test email template "E2E Verify — spring promo" deactivated

---

## 5. Test A‑04 — email copy — PASSED

Ran a live referrer signup and an Arizona referral on 7 September.

| Check | Result |
|---|---|
| Sender | `referral@nuvisionautoglass.com`, **signed-by nuvisionautoglass.com** — DKIM aligned |
| Encryption | TLS |
| Welcome email | "You earn $50 once a referred customer's installation is completed — not before." |
| Referee confirmation | "Your referral benefit: $50 additional cash back with insurance or $50 off a cash payment." — matches the AZ campaign exactly |
| Referrer name in referee email | "through QA 07 Sonu's referral" — personalised |
| Merge tags | All rendered. No raw `{{first_name}}` |
| Thank-you page privacy | A fresh visitor to the same referral link sees the normal form, **not** the previous person's details |

**Still open from this test:**

| ID | Item |
|---|---|
| E‑02 | Welcome email has no plain-text referral link — button only. People copy-paste links into WhatsApp |
| E‑03 | No email footer — no logo, no postal address, no unsubscribe |
| E‑04 | The referee email heading renders in monospace (font fallback bug in that template only) |

---

## 6. Test A‑05 — dashboard figures — PASSED

The original "$500 vs $550" gap was **not a bug** — the two screens were read minutes apart and a reward was paid in between.

| Check | Should be | Actually is | Result |
|---|---|---|---|
| Paid all time ÷ $50 | = rewards paid | $550 ÷ 50 = 11 vs funnel 11 | Pass |
| Eligible now ÷ $50 | = rewards awaiting | $200 ÷ 50 = 4 vs "4 rewards await payment" | Pass |
| Blocked ÷ $50 | = forms not installed | $350 ÷ 50 = 7 vs 22 − 15 = 7 | Pass |
| Paid + eligible | = Installed | 11 + 4 = 15 vs 15 | Pass |
| Paid + eligible + blocked | = Referral forms | 11 + 4 + 7 = 22 vs 22 | Pass |
| Form-to-install | 15 ÷ 22 | 68.2% vs 68.2% | Pass |
| AZ 74% + FL 33% | should total 15 installs | AZ 14/19 + FL 1/3 = 15 | Pass |
| "Oldest eligible" ageing | 15 days on 4 Sep → 18 on 7 Sep | 18 days | Pass |
| **Active referrers** | = distinct referrers | **22 shown, only 14 distinct referrer emails exist** | **Fail — D‑01** |

**D‑01:** the tile almost certainly counts referrals, not referrers — it matches "Referral forms 22" exactly. The 14 distinct referrer emails are: `wonka@nv.com`, `priya.charlie.e2e@`, `devon.bravo.e2e@`, `maria.alpha.e2e@`, `e2e.referrer.980471@`, `info@nuvisionautoglass.com`, `test@newlead.com`, `sonu@referer.com`, `test@gmail.com`, `sonu@nuvisionautoglass.com`, `e2e.finaltest@`, `hubspotqa.referrer@`, `rom@example.com`, `retest-qa@example.com`.

---

## 7. The GTM regression

Adding `GTM-5HRL52B` brought the whole main-site tag stack onto the subdomain.

| Measure | 4 Sep | 7 Sep |
|---|---|---|
| Full page load | 885 ms | **3,391 ms** |
| Time to first byte | 477 ms | 1,311 ms |
| Requests | 40 | 84 |
| Third-party hosts | **0** | **19** |

The 19 include Google Ads / DoubleClick, Facebook, **Microsoft Clarity**, Bing, Brevo and Zoho SalesIQ chat.

Two problems: the referral page was the fastest thing NuVision owns and is now slower than the main quote page; and Clarity records sessions on a page that collects name, email, phone and insurance provider, behind an implied-consent banner.

**Fix:** in GTM, scope the ad and session-recording tags to `www.nuvisionautoglass.com` only. Let the subdomain load GA4 plus the three referral events, nothing else.

---

## 8. Cutover checklist for the main site

Re-checked on production and staging with the cache bypassed. **Nothing on WordPress has changed.**

| # | Where | Change | Status |
|---|---|---|---|
| 1 | Global menu "Referral Progam" | Replace both Referral Factory links with `https://referrals.nuvisionautoglass.com/` — desktop **and** mobile | Pending |
| 2 | Same menu label | Fix the typo: "Progam" → "Program" | Pending |
| 3 | `/referral-program-faq/` | Swap links, add a real `H1` (there is none), keep FAQPage schema | Pending |
| 4 | `/referral-program-faq-florida/` | Same, plus remove "Claim An Extra $50 Off!" — no customer offer in FL. It loads as a delayed popup, so a quick check misses it | Pending |
| 5 | Both FAQ pages | Add reward redemption detail and the eligibility disclaimer | Pending |
| 6 | New signup page | Terms & Conditions checkbox | **Done** |
| 7 | New subdomain | GTM + three referral events | Container live, events pending |
| 8 | Referral Factory | Pause, do not delete | Correct as is — must stay live until step 1 ships |
| 9 | Redirects | Do not 301 the old links | Correct as is — not our domain |
| 10 | Cloudflare | Purge after the menu change | Nothing to purge yet |

---

## 9. The two content gaps, explained

Both are the same problem: **the old Referral Factory page told the referrer something the new site does not.**

### Reward detail

Old page: "$50 bonus which can be redeemed as: Vouchers — Amazon / Walmart / Target / Starbucks. Direct bank transfer — ACH / PayPal / Venmo." Florida: vouchers only.

New site: just "$50".

Verified: the words *voucher, Amazon, Venmo, PayPal, ACH, gift card* appear **nowhere** on the referral site, including `/terms`. Section 4 of the terms covers timing, tax and W-9 but never says how you are paid.

**Why it matters:** "$50" is a number. "$50 as an Amazon card or straight to your bank" is something people can picture. It is also the most likely support question.

### Eligibility disclaimer

Old page: "Only customers who fill out the form through the unique link shared by the referrer are eligible... The invitee and referrer will not be eligible if the invitee directly contacts us."

In plain terms: *you only get paid if your friend uses your link.*

New site: the rule **is** in `/terms` section 3, properly written. But the referrer never sees it. This is the single most common referral dispute — friend calls the office directly, job happens, referrer asks where their $50 is.

### How to test both — 4 minutes

| Step | Do this |
|---|---|
| 1 | Old AZ page `…/7ztxOB` — find "Earn Rewards", see the voucher and bank-transfer list |
| 2 | Old FL page `…/cPXcHGVa` — same section, **vouchers only** |
| 3 | New site homepage — Ctrl+F for `Amazon` |
| 4 | `/terms` — Ctrl+F for `Amazon`, `Venmo`, `voucher` |
| 5 | Old AZ page — find the word **"Disclaimer"** above the form |
| 6 | New signup page — Ctrl+F for `unique link`, then `directly contact` |

Pass = you find them. Fail = zero results, which is what I got.

### Suggested fix — one text block under the $50 figure

> **Get $50 as an Amazon, Walmart, Target or Starbucks voucher — or straight to your bank.**
> *Florida: voucher only.*
> Your friend must book through your link. If they contact us directly, the reward does not apply.

Three lines. Closes both items and puts the rule in front of the person it applies to.

---

## 10. Everything else still pending

| ID | Item |
|---|---|
| R‑10 | Insurance provider is **required** on the referral form, but optional on the production quote form ("Leave blank for cash payments"). The AZ offer includes "$50 off a cash payment", so cash customers exist and will pick a wrong provider |
| A‑04 residuals | Florida still has no email template; neither state has an SMS template |
| C‑03 | `/track` shows "Sign out" when logged out, and authenticates with email + last 4 digits of phone — guessable |
| C‑05 | Reward terms and the disclaimer are not surfaced in the flow |
| C‑06 | `/demo` title duplicated: "Demo Tour \| NuVision Referrals \| NuVision Referrals" |
| E‑02, E‑03, E‑04 | Email items from section 5 |
| D‑01 | Active referrers tile |
| — | Out-of-area ZIP (SC, CO) is still a dead end — "We're not in that area yet" with no quote link. NuVision serves four states; the referral site knows two |
| — | Name the reward on the signup page (see section 9) |

---

## 11. Recommended order

1. **B‑08** — fix the "Track my referrals" URL, and block referrals where customer email matches the referrer's. One line plus one rule.
2. **B‑03** — write the referrer into HubSpot. Set `lead_source` to "Referral" in the same pass (it is currently "Marketing" on one record and "Outside Sales" on four).
3. **GTM scope** — restrict ad and recording tags to the main site, then add the three referral events.
4. **A‑04 residuals** — write the Florida email and the SMS templates.
5. **Section 9 text block** — reward detail and disclaimer on the signup page.
6. **Cutover steps 1–5** — the WordPress changes.
7. **Step 8** — pause the Referral Factory campaigns, last.

---

## 12. Notes and corrections from this session

- I first reported that the new signup had no Terms checkbox. Wrong for the referee page — that form always had one. The referrer signup was the one missing it, and it has since been added.
- I gave test steps using direct admin URLs such as `/admin/referrals`. Those fail with "This page couldn't load" — the admin only routes correctly if you start at `/admin` and click the sidebar.
- Project memory could not be saved during one run because the desktop connection dropped. This file is the record.

---

*NuVision Auto Glass · referral cutover · reviewed 4 Sep, re-checked 7 Sep 2026 · read-only review*
