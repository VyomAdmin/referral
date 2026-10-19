# Local test mode

The public forms and the staff actions run in Cloud Functions. Tests call those functions with an in-memory store and a mock CRM. They do not open a network connection to GoHighLevel, and they do not write to a hosted database.

`tests/referral-flow.test.ts` covers signup, a quote, a signed stage webhook, an eligible reward, and a staff member marking that reward paid.

`tests/firestore-rules.test.ts` loads `firestore.rules` in the Local Emulator Suite. Client writes are denied. Staff reads of program data are allowed.

`npm run dev:api` starts `server/local.ts` for browser checks. Set `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` in the environment if you need the staff portal. The process keeps that password in memory. It is not a Firebase user and it is not written to Firestore.

`LOCAL_COVERAGE` can seed the in-memory coverage list for that process only. Leave it unset to see the uncovered-ZIP path. `LOCAL_MOCK_CRM=true` swaps in an in-process CRM double so a browser check can finish a referral without a network call. Do not put real customer data in this server.

There is no seeded production dataset in this repo.
