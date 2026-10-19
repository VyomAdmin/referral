# Referral platform

Public pages and the staff portal are a static web app. Cloud Functions are the only code that writes to Firestore and the only code that talks to GoHighLevel. The public site calls those functions. It does not read Firestore. The staff portal reads Firestore under `firestore.rules` and sends changes to the functions.

The company name, domain, sender, reward amount, customer benefit, and ZIP list are not set. See `OPEN_QUESTIONS.md`.

Nothing in this repo is deployed. Do not point it at a live CRM, a live database, or a live hosting project.

## Local checks

```bash
npm install
npm install --prefix functions
npm test
npm run lint
```

`npm test` runs the referral flow against an in-memory store and a mocked CRM, then the Firestore rules against the Local Emulator Suite. The rules test needs Java and will download the Firestore emulator the first time.

Two processes for the browser:

```bash
LOCAL_ADMIN_EMAIL=you@example.com LOCAL_ADMIN_PASSWORD='a-local-password' LOCAL_COVERAGE='00000:FL' npm run dev:api
npm run dev:web
```

`00000` in that example is a local fixture, not a service-area ZIP. The dev API is `server/local.ts`. It is not Firebase Authentication and it is not a deployed function.

Open `http://127.0.0.1:5173/`. The home page is the opt-in form. `/privacy` has the SMS placeholder. `/r/<code>` is the quote form.

## Coverage import

`coverage.csv.example` has the header `zip,state` and no data rows. States must be `FL` or `SC`.

```bash
npm run import:coverage -- path/to.csv
```

Without `COVERAGE_IMPORT_URL` the script validates and writes nothing. With that URL set, it POSTs the file to the admin import function. The caller supplies `COVERAGE_IMPORT_TOKEN`.

## Production shape

Firebase Hosting serves `web/dist`. `firebase.json` rewrites `/api/**` to the `api` function. Scheduled functions retry CRM sync hourly and compare Firestore stages with GoHighLevel at 06:00 UTC.

Secrets belong in Secret Manager. Names and rules are in `docs/security.md`. GoHighLevel setup is in `docs/ghl-setup.md`.

Build the web app and the functions bundle with `npm run build`. This does not deploy.
