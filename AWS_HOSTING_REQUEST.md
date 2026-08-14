# AWS Access Request — NuVision Referral Platform

## What this is
Internal Next.js web app (referrer/customer referral portal + admin ops portal), currently in test mode. I'll handle all re-platforming and deployment myself — this request is only for the AWS access needed to build and deploy it directly.

## Access requested
- An AWS account (or account/OU) to work in — separate dev and prod if that's the org's norm, otherwise one account is fine to start
- An IAM user or SSO role for me personally (console + CLI), scoped to (not full admin):
  - ECS/Fargate or App Runner — compute
  - RDS — database instance
  - S3 — buckets for assets/artifacts
  - Secrets Manager — app secrets (DB creds, API keys, `AUTH_SECRET` for admin session/JWT signing)
  - CloudFront + ACM — CDN + TLS certificate
  - Route 53 — DNS record for the app's subdomain
  - SES — transactional email sending + domain verification
  - CloudWatch Logs — app/error logs
  - VPC — access to an existing VPC/subnets, or permission to create one
- CLI access keys or federated SSO login — whichever matches how the org normally grants individual access.
- Confirmation of naming/tagging conventions the account expects, so resources I create pass any existing compliance/tagging checks.

## Artifacts to share with the admin (so he can size/scope the grant)
1. **This document** — the access ask itself.
2. **`BUILD.md`** (in repo) — what the app does and its data model, for sizing compute/DB.
3. **`TEST_MODE.md`** (in repo) — current state; confirms no production traffic/data yet.
4. **`package.json`** — runtime requirements (Node ≥22.13) to confirm compute compatibility.
5. **Target subdomain** (e.g. `referrals.nuvisionautoglass.com`) — needed to confirm it's under a Route 53 zone he controls, or to create one.

## Not needed from him right now
- Production HubSpot or email provider credentials — those are handled separately once the app is off test mode.
- Any resource provisioning on his part — I'll create everything myself once access is granted.
