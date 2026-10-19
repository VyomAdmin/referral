# CLAUDE.md

## Commands

- Install: `npm install` and `npm install --prefix functions`
- API for browser checks: `npm run dev:api`
- Web: `npm run dev:web`
- Test: `npm test`
- Lint: `npm run lint`
- Build: `npm run build`
- Coverage CSV: `npm run import:coverage -- <file.csv>`

## Layout

- `web/` — public opt-in, quote, tracking, and staff portal
- `functions/src/` — Cloud Functions handlers, Firestore store, CRM adapter
- `config/site.ts` — company, campaign, and vendor settings from the environment
- `firestore.rules` — deny-all, then staff reads
- `tests/` — flow tests and rules tests

## Rules

- Search `functions/src` and `config` before adding a helper.
- Cloud Functions are the only writers and the only CRM callers.
- The public site does not read Firestore.
- Do not commit secrets. Empty config means the value is not set.
- Do not add ZIP codes. Import them from a CSV the company provides.
- Customer messages do not include the referrer reward.
- A non-fatal CRM or messaging failure must not fail signup or quote.
