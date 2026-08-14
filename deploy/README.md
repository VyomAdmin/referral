# Deploying to AWS

**Current state (as of 2026-08-14): live.** Deployed to AWS account `035722575731`,
region `us-east-1`. App Runner service `nuvision-referral`
(`https://uykwpxswmu.us-east-1.awsapprunner.com`), RDS Postgres instance
`nuvision-referral-db` (private, reachable only via an App Runner VPC
connector — no public ingress), Secrets Manager holds `DATABASE_URL` and
`AUTH_SECRET`. Verified end-to-end: login, TOTP 2FA enrollment, tracker token
mint/verify/reject, and the HubSpot webhook's 503-when-unconfigured behavior.

This doc is both the historical "how to deploy from scratch" sequence and a
record of three real bugs that first deployment surfaced — read the "Bugs
found" section before re-running `deploy/aws-setup.sh` against a fresh
account, since the script has been corrected for two of them but the fixes
also live in application code you should already have via git pull.

## Bugs found deploying for the first time (all fixed in code/config, not workarounds)

1. **RDS requires SSL; the app didn't request it.** `pg.Pool` connects
   plaintext by default and RDS rejects that outright. Fix: append
   `?sslmode=no-verify` to the `DATABASE_URL` value itself (encrypts, skips CA
   verification — RDS's cert isn't in Node's default trust store). No code
   change needed; this only affects the connection string's *value*, documented
   in `.env.example`.
2. **App Runner silently ignores API-supplied secrets/env vars when
   `ConfigurationSource: REPOSITORY`.** Passing `RuntimeEnvironmentSecrets`/
   `RuntimeEnvironmentVariables` in the `create-service` API call looked like
   it worked (echoed back in `describe-service`) but none of it reached the
   container — confirmed with a temporary debug route. For a GitHub-source
   service, secrets and env vars must be declared directly in `apprunner.yaml`'s
   `run.env`/`run.secrets` blocks, with real Secrets Manager ARNs. Fixed in
   `apprunner.yaml` (this repo) and `deploy/aws-setup.sh` (now prompts you to
   confirm this before creating the service instead of silently deploying a
   broken config).
3. **`/admin` redirect-looped after a successful login.** The login response's
   redirect resolved to `http://`, not `https://`, on this real HTTPS
   deployment — vinext's `middleware.ts` layer and the next-auth route-handler
   layer disagreed on whether the request was "secure," so one wrote a
   `authjs.session-token` cookie and the other looked for
   `__Secure-authjs.session-token`. Fixed with `useSecureCookies:
   process.env.NODE_ENV === "production"` in `app/lib/auth.ts` — forces both
   layers to agree instead of relying on inconsistent auto-detection.

## 0. One-time manual step (can't be scripted)

App Runner's GitHub source requires a "connection" that's authorized through
an interactive GitHub OAuth flow in the AWS Console — there's no CLI/API way
to complete this handshake:

1. AWS Console → App Runner → **GitHub connections** → Add connection.
2. Authorize AWS's GitHub App against the `VyomAdmin/referral` repo.
3. Copy the resulting connection ARN (`arn:aws:apprunner:...:connection/...`).

## 1. Run the setup script

```bash
aws configure   # or set AWS_PROFILE to an identity with RDS/Secrets Manager/IAM/App Runner access

export APPRUNNER_CONNECTION_ARN="arn:aws:apprunner:...:connection/..."   # from step 0
cd nuvision-referral-agent-handoff/referral
./deploy/aws-setup.sh
```

It provisions RDS, generates `AUTH_SECRET`, stores secrets, runs the
migration, creates the IAM role, then **pauses** to have you confirm
`apprunner.yaml`'s `run.secrets` block has the real ARNs it just printed,
committed and pushed — see bug #2 above for why this can't be automated away
entirely. It's safe to re-run — it skips anything that already exists.

## 2. Lock down RDS (done for the current deployment; do this for any new one)

The script leaves RDS reachable from the operator's IP only, purely to run
the one-time migration — not production-ready as-is. What was actually done
here, in order:

1. Created an App Runner **VPC connector** (its own security group, default
   VPC's subnets) and pointed the service's egress at it
   (`aws apprunner update-service --network-configuration ...`).
2. Added an ingress rule on the RDS security group allowing 5432 from the
   connector's security group specifically (not a CIDR).
3. Revoked the migration-time CIDR ingress rules (both the operator's IP and,
   temporarily, `0.0.0.0/0` — App Runner without a VPC connector has no fixed
   egress IP to allowlist, which is exactly why the connector is the fix, not
   a narrower CIDR).
4. `aws rds modify-db-instance --no-publicly-accessible --apply-immediately`.

Verified the app still works end-to-end after all four steps — RDS has no
public exposure at all now.

Also: rotate the RDS master password once you've confirmed the app works — it
was auto-generated into a local `.rds-master-password-*.txt` file, which
should move to a password manager and then be deleted, not left on disk.

## 3. Fill in the real HubSpot secret when ready

`HUBSPOT_CLIENT_SECRET` was never created — Secrets Manager rejects an empty
string, and there's no real value to put there yet. When you have one:

```bash
aws secretsmanager create-secret --name nuvision-referral/HUBSPOT_CLIENT_SECRET --secret-string "<real value>" --region us-east-1
```

Then add it to the IAM role's policy and to `apprunner.yaml`'s `run.secrets`
block (same pattern as `DATABASE_URL`/`AUTH_SECRET` — see bug #2). Until then,
the webhook route (`app/api/webhooks/hubspot/route.ts`) correctly returns a
503 "HubSpot is not configured" — verified live.

## 4. Seed a real admin user

There's no signup flow (`/admin` is invite-only by design). Create a login by
hand against the deployed database — this is exactly what was run to create
the current admin user (`admin@nuvisionautoglass.com`, password shared with
you separately, rotate it after your first login):

```ts
// one-off script, placed inside the repo (relative imports resolve from there),
// run locally with DATABASE_URL pointed at the RDS instance via the VPC
// connector's absence — you'll need a temporary local-IP ingress rule on the
// RDS security group again, or run this from inside the VPC (e.g. an EC2
// bastion or a one-off ECS task), since RDS is no longer publicly reachable.
import { hashPassword } from "./app/lib/password.ts";
import { getDb } from "./db/index.ts";
import { organizations, teamMembers, users } from "./db/schema.ts";

const db = getDb();
const orgId = crypto.randomUUID();
const userId = crypto.randomUUID();
await db.insert(organizations).values({ id: orgId, slug: "nuvision", name: "NuVision", brandName: "NuVision Auto Glass" });
await db.insert(users).values({ id: userId, email: "you@nuvisionautoglass.com", passwordHash: await hashPassword("<choose a real password>") });
await db.insert(teamMembers).values({ id: crypto.randomUUID(), organizationId: orgId, userId, email: "you@nuvisionautoglass.com", name: "Your Name", role: "owner", status: "active" });
```

## 5. End-to-end test checklist — all verified live on the current deployment

- [x] Visit `/admin` while logged out → redirected to `/admin/login`.
- [x] Log in with the seeded user's email/password → dashboard loads with the
      real name/role in the sidebar (not the old "Sandeep / Owner" mock).
- [x] Visit `/admin/settings/security` → QR code renders.
- [ ] Scan the QR with an authenticator app, confirm the 6-digit code →
      "Two-factor authentication is now enabled." (needs a physical
      authenticator app — not verifiable via curl, do this manually once)
- [ ] Log out, log back in — now required to supply the TOTP code too.
- [x] Mint a tracker token, visit its URL → tracker page loads (not
      "invalid tracker").
- [x] Tamper with the token and reload → renders the `InvalidTracker` state.
- [x] `curl -i https://<app-runner-url>/api/webhooks/hubspot` with no
      signature → 503 "HubSpot is not configured".
