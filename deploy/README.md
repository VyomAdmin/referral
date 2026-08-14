# Deploying to AWS

This provisions RDS Postgres, three Secrets Manager entries, an App Runner
instance role, and an App Runner service that builds from GitHub using
`apprunner.yaml`. There's no AWS access configured in the environment this was
written in, so `deploy/aws-setup.sh` has **not** been run — this is the exact
sequence to run it once you have an AWS identity with the permissions listed
in `AWS_HOSTING_REQUEST.md`.

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

What it does, in order: looks up your default VPC, opens Postgres (:5432) to
your current IP only, creates a `db.t4g.micro` RDS Postgres 16 instance,
generates `AUTH_SECRET` and stores `DATABASE_URL`/`AUTH_SECRET`/
`HUBSPOT_CLIENT_SECRET` (empty placeholder) in Secrets Manager, runs
`npm run db:migrate` against the new database, creates an IAM role scoped to
read exactly those three secrets, and creates the App Runner service wired to
them.

It's safe to re-run — it skips anything that already exists.

## 2. Security follow-up (the script does not do this automatically)

The script leaves RDS **publicly accessible**, reachable only from the IP it
detected at run time, purely so it could run the one-time migration. Before
calling this production-ready:

- Set up a VPC connector for the App Runner service and re-point RDS access
  through it, then remove the public ingress rule the script added
  (`aws ec2 revoke-security-group-ingress ...` on the `<app>-db-sg` group).
- Rotate the RDS master password once you've confirmed the app works — it was
  auto-generated into `.rds-master-password.txt`, which should be moved to a
  password manager and deleted, not left on disk.

## 3. Fill in the real HubSpot secret when ready

```bash
aws secretsmanager put-secret-value --secret-id nuvision-referral/HUBSPOT_CLIENT_SECRET --secret-string "<real value>"
```

The webhook route (`app/api/webhooks/hubspot/route.ts`) already returns a
clean 503 "HubSpot is not configured" while this is empty — no code change
needed either way.

## 4. Seed a real admin user

There's no signup flow (`/admin` is invite-only by design). Create the first
login by hand against the deployed database:

```ts
// one-off script, run locally with DATABASE_URL pointed at the RDS instance
import { hashPassword } from "../app/lib/password.ts";
import { getDb } from "../db/index.ts";
import { organizations, teamMembers, users } from "../db/schema.ts";

const db = getDb();
const orgId = crypto.randomUUID();
const userId = crypto.randomUUID();
await db.insert(organizations).values({ id: orgId, slug: "nuvision", name: "NuVision", brandName: "NuVision Auto Glass" });
await db.insert(users).values({ id: userId, email: "you@nuvisionautoglass.com", passwordHash: await hashPassword("<choose a real password>") });
await db.insert(teamMembers).values({ id: crypto.randomUUID(), organizationId: orgId, userId, email: "you@nuvisionautoglass.com", name: "Your Name", role: "owner", status: "active" });
```

## 5. End-to-end test checklist

Once the App Runner service is `RUNNING` (get its URL with the command the
script prints at the end):

- [ ] Visit `/admin` while logged out → redirected to `/admin/login`.
- [ ] Log in with the seeded user's email/password → dashboard loads with the
      real name/role in the sidebar (not the old "Sandeep / Owner" mock).
- [ ] Visit `/admin/settings/security`, scan the QR with an authenticator app,
      confirm the 6-digit code → "Two-factor authentication is now enabled."
- [ ] Log out, log back in — now required to supply the TOTP code too.
- [ ] Open a referral in the dashboard, click "Copy tracker link", open the
      copied URL in an incognito window → tracker page loads (not
      "invalid tracker").
- [ ] Hand-edit one character of that URL's token and reload → renders the
      `InvalidTracker` state.
- [ ] `curl -i https://<app-runner-url>/api/webhooks/hubspot` with no
      signature → 503 "HubSpot is not configured" (confirms the placeholder
      secret didn't silently enable webhook processing).
