# CLAUDE.md

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Test (all): `npm test` (runs build, then `node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs`)
- Test (single file): `node --experimental-strip-types --test tests/<file>.test.ts`
- Lint: `npm run lint`
- Build: `npm run build`
- DB schema change: `npm run db:generate` then `npm run db:migrate` (drizzle-kit)

## Project Structure
- `/app` — vinext (Next-like) app router: pages, `api/` routes, `admin/`, `r/` (referral links), `track/`, `components/`, `lib/`
- `/db` — Drizzle ORM: `schema.ts` (tables), `index.ts` (client/connection)
- `/drizzle` — generated SQL migrations (do not hand-edit)
- `/tests` — `node --test` suites (`.test.ts` / `.test.mjs`), one per feature area (auth, hubspot, referral rules, email templates)
- `/scripts` — `start.sh` (App Runner entrypoint), not part of the Next build
- `/deploy`, `apprunner.yaml`, `Dockerfile` — AWS App Runner deployment config
- `middleware.ts` — next-auth route protection

## Stack
- vinext (Next.js-compatible, React 19 RSC) + Tailwind v4
- Drizzle ORM over Postgres (AWS RDS in prod; RDS requires `?sslmode=no-verify` in `DATABASE_URL` — see `.env.example`)
- next-auth (beta) for admin auth; TOTP via `otplib`
- HubSpot integration (webhook + sync) is a side effect, not core path — see gotcha below

---

## Code Quality & Reusability Rules

- **Search before writing.** Grep `/app/lib` and `/db` for existing helpers before adding new logic — never duplicate.
- **No dead code.** Delete commented-out code, unused imports/vars, and unreachable branches in the same change.
- **Single responsibility, short functions.** Split anything over ~40 lines or doing more than one thing.
- **Default to shared utilities** in `app/lib` for validation, formatting, HubSpot calls, email templates — not inline per route.
- **No premature abstraction.** Match existing patterns (e.g. existing referral-rules structure) rather than inventing new ones.
- **Minimize dependencies.** Don't add a package for something a few lines of plain code can do.
- **Every new function should be independently testable** — no hidden dependencies on global state or call order; add/extend a matching file under `/tests`.

---

## Security Requirements (non-negotiable)

- **Never hardcode credentials, tokens, or API keys.** Read from env vars (`DATABASE_URL`, `HUBSPOT_CLIENT_SECRET`, `AUTH_SECRET`) — never commit real values. Flag any hardcoded secret found rather than working around it.
- **Validate and sanitize all external input** — HubSpot webhook payloads, referral form submissions, API route bodies — before use.
- **Verify HubSpot webhook signatures** using `HUBSPOT_CLIENT_SECRET` before trusting payloads; if unset, the integration should stay in test-mode/disabled, not silently accept unverified requests.
- **Wrap external API/network calls in try/catch** (HubSpot API, Postgres/RDS). Fail gracefully; never leak internal errors or stack traces to end users.
- **Flag risky dependencies** — known CVEs, or unmaintained 2+ years — instead of silently adding them.
- **Non-fatal side actions stay non-fatal.** HubSpot sync/logging failures must not abort the core referral flow (signup, tracking, admin actions).

---

## Conventions
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`)
- Always propose a diff and wait for approval before committing, unless told otherwise.
- State management: server-side (Drizzle/Postgres) is source of truth; avoid client-side global state — prefer server actions/route handlers per existing `app/` structure.
- Error handling: throw/return typed errors from `app/lib`; never silently swallow failures in referral, auth, or HubSpot sync paths.

## Boundaries — do not touch without asking
- `/drizzle` generated migrations already applied to a DB
- `.next`, `.vinext`, `dist`, `build`, `node_modules` — generated output
- `apprunner.yaml`, `Dockerfile`, `/deploy` — production deploy config
- `.env`, `.env.example` values (edit structure, never commit real secrets)

## Known Gotchas
- RDS Postgres requires `?sslmode=no-verify` appended to `DATABASE_URL` (encrypts, skips CA verification) — plain local Postgres doesn't need it.
- A hardcoded referrer name previously shipped to prod and was only caught via live Playwright QA — don't assume static/demo data has been swapped for real data; check `app/r/` and `app/track/` render paths against actual DB values before calling a display fix done.
- HubSpot webhook signature validation is gated by `HUBSPOT_CLIENT_SECRET`; leaving it unset intentionally disables/test-modes the webhook — don't "fix" this by hardcoding a bypass.

---

## Before finishing any task
1. Search `/app/lib` and `/db` for duplicate/similar logic — reuse instead of rewriting.
2. Remove dead code introduced during iteration (unused vars, leftover debug logs, abandoned attempts).
3. Run `npm run lint` and `npm test`.
4. Confirm no secrets or credentials appear in the diff (check `.env`, config files, and any HubSpot/DB connection strings).

---

*Keep this file under ~100 lines. When Claude makes a mistake because a convention wasn't documented here, add one line for it. Don't add rules for problems that haven't happened yet.*
