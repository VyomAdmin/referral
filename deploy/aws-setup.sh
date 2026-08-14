#!/usr/bin/env bash
# Provisions the NuVision referral platform on AWS: RDS Postgres, Secrets Manager
# entries, an IAM role for App Runner, and an App Runner service.
#
# Prerequisites (one-time, manual, cannot be scripted):
#   1. `aws configure` (or AWS_PROFILE) with an IAM identity that has permissions
#      for RDS, Secrets Manager, IAM, and App Runner (see AWS_HOSTING_REQUEST.md).
#   2. An App Runner GitHub connection, authorized once via the AWS Console:
#      App Runner console -> "GitHub connections" -> Add connection -> authorize
#      the VyomAdmin/referral repo. Copy the resulting connection ARN into
#      APPRUNNER_CONNECTION_ARN below (or pass it as an env var).
#
# This script is idempotent: re-running it skips resources that already exist.
# It does NOT run `npm test`/`npm run build` — run those locally before deploying.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
APP_NAME="${APP_NAME:-nuvision-referral}"
DB_INSTANCE_ID="${DB_INSTANCE_ID:-${APP_NAME}-db}"
DB_NAME="${DB_NAME:-referral}"
DB_MASTER_USER="${DB_MASTER_USER:-referral_admin}"
GITHUB_REPO_URL="${GITHUB_REPO_URL:-https://github.com/VyomAdmin/referral}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
APPRUNNER_CONNECTION_ARN="${APPRUNNER_CONNECTION_ARN:?Set APPRUNNER_CONNECTION_ARN to the App Runner GitHub connection ARN (see prerequisites above)}"

log() { echo "[$(date +%H:%M:%S)] $*"; }

# ---------------------------------------------------------------------------
# 1. Network: default VPC/subnets + a security group for RDS
# ---------------------------------------------------------------------------
log "Looking up default VPC..."
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "$AWS_REGION")
SUBNET_IDS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[].SubnetId' --output text --region "$AWS_REGION")
log "VPC: $VPC_ID  Subnets: $SUBNET_IDS"

SG_NAME="${APP_NAME}-db-sg"
SG_ID=$(aws ec2 describe-security-groups --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION" 2>/dev/null || true)
if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  log "Creating security group $SG_NAME..."
  SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" --description "Referral RDS access" \
    --vpc-id "$VPC_ID" --query 'GroupId' --output text --region "$AWS_REGION")
fi

# Temporary: allow the operator's current IP to reach Postgres for the one-time
# migration run below. TIGHTEN THIS AFTERWARD — see step 6.
MY_IP=$(curl -s https://checkip.amazonaws.com)
log "Authorizing $MY_IP/32 -> :5432 on $SG_ID (temporary, for migration)..."
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 5432 \
  --cidr "${MY_IP}/32" --region "$AWS_REGION" 2>/dev/null || log "  (rule already exists, continuing)"

# ---------------------------------------------------------------------------
# 2. RDS Postgres instance
# ---------------------------------------------------------------------------
if aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" --region "$AWS_REGION" >/dev/null 2>&1; then
  log "RDS instance $DB_INSTANCE_ID already exists, skipping creation."
else
  DB_MASTER_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
  log "Creating RDS instance $DB_INSTANCE_ID (db.t4g.micro, Postgres 16)..."
  aws rds create-db-instance \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version 16 \
    --allocated-storage 20 \
    --db-name "$DB_NAME" \
    --master-username "$DB_MASTER_USER" \
    --master-user-password "$DB_MASTER_PASSWORD" \
    --vpc-security-group-ids "$SG_ID" \
    --publicly-accessible \
    --backup-retention-period 7 \
    --no-multi-az \
    --storage-encrypted \
    --region "$AWS_REGION"
  log "Waiting for RDS instance to become available (this takes several minutes)..."
  aws rds wait db-instance-available --db-instance-identifier "$DB_INSTANCE_ID" --region "$AWS_REGION"
  echo "$DB_MASTER_PASSWORD" > .rds-master-password.txt
  log "Master password written to .rds-master-password.txt — move it into a password manager and delete the file."
fi

DB_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text --region "$AWS_REGION")
log "RDS endpoint: $DB_ENDPOINT"

if [ -f .rds-master-password.txt ]; then
  DB_MASTER_PASSWORD=$(cat .rds-master-password.txt)
else
  read -rsp "Enter the existing RDS master password for $DB_MASTER_USER: " DB_MASTER_PASSWORD
  echo
fi
DATABASE_URL="postgresql://${DB_MASTER_USER}:${DB_MASTER_PASSWORD}@${DB_ENDPOINT}:5432/${DB_NAME}"

# ---------------------------------------------------------------------------
# 3. Secrets Manager
# ---------------------------------------------------------------------------
AUTH_SECRET=$(openssl rand -base64 32)

put_secret() {
  local name="$1" value="$2"
  if aws secretsmanager describe-secret --secret-id "$name" --region "$AWS_REGION" >/dev/null 2>&1; then
    log "Updating secret $name..."
    aws secretsmanager put-secret-value --secret-id "$name" --secret-string "$value" --region "$AWS_REGION" >/dev/null
  else
    log "Creating secret $name..."
    aws secretsmanager create-secret --name "$name" --secret-string "$value" --region "$AWS_REGION" >/dev/null
  fi
}

put_secret "${APP_NAME}/DATABASE_URL" "$DATABASE_URL"
put_secret "${APP_NAME}/AUTH_SECRET" "$AUTH_SECRET"
# Real value must come from you — HubSpot app credentials aren't something I can generate.
# Leaving this as an empty placeholder keeps the webhook route in its existing safe
# "HubSpot is not configured" (503) state until you fill it in.
if ! aws secretsmanager describe-secret --secret-id "${APP_NAME}/HUBSPOT_CLIENT_SECRET" --region "$AWS_REGION" >/dev/null 2>&1; then
  put_secret "${APP_NAME}/HUBSPOT_CLIENT_SECRET" ""
fi

DATABASE_URL_ARN=$(aws secretsmanager describe-secret --secret-id "${APP_NAME}/DATABASE_URL" --query 'ARN' --output text --region "$AWS_REGION")
AUTH_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${APP_NAME}/AUTH_SECRET" --query 'ARN' --output text --region "$AWS_REGION")
HUBSPOT_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${APP_NAME}/HUBSPOT_CLIENT_SECRET" --query 'ARN' --output text --region "$AWS_REGION")

# ---------------------------------------------------------------------------
# 4. Run the Drizzle migration against the new database
# ---------------------------------------------------------------------------
log "Running drizzle-kit migrate against $DB_ENDPOINT..."
(cd "$(dirname "$0")/.." && DATABASE_URL="$DATABASE_URL" npm run db:migrate)

# ---------------------------------------------------------------------------
# 5. IAM role for App Runner (reads the three secrets above)
# ---------------------------------------------------------------------------
ROLE_NAME="${APP_NAME}-apprunner-instance-role"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  log "Creating IAM role $ROLE_NAME..."
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "tasks.apprunner.amazonaws.com"}, "Action": "sts:AssumeRole"}]
  }' >/dev/null
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name secrets-read --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{\"Effect\": \"Allow\", \"Action\": \"secretsmanager:GetSecretValue\",
      \"Resource\": [\"$DATABASE_URL_ARN\", \"$AUTH_SECRET_ARN\", \"$HUBSPOT_SECRET_ARN\"]}]
  }" >/dev/null
fi
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

# ---------------------------------------------------------------------------
# 6. App Runner service (builds from GitHub using apprunner.yaml)
# ---------------------------------------------------------------------------
if aws apprunner list-services --region "$AWS_REGION" --query "ServiceSummaryList[?ServiceName=='${APP_NAME}'] | [0].ServiceArn" --output text | grep -q .; then
  log "App Runner service $APP_NAME already exists — update it manually or via 'aws apprunner update-service' if the source config changed."
else
  log "Creating App Runner service $APP_NAME..."
  aws apprunner create-service \
    --service-name "$APP_NAME" \
    --source-configuration "{
      \"AutoDeploymentsEnabled\": true,
      \"AuthenticationConfiguration\": {\"ConnectionArn\": \"$APPRUNNER_CONNECTION_ARN\"},
      \"CodeRepository\": {
        \"RepositoryUrl\": \"$GITHUB_REPO_URL\",
        \"SourceCodeVersion\": {\"Type\": \"BRANCH\", \"Value\": \"$GITHUB_BRANCH\"},
        \"CodeConfiguration\": {
          \"ConfigurationSource\": \"REPOSITORY\",
          \"CodeConfigurationValues\": {
            \"RuntimeEnvironmentSecrets\": {
              \"DATABASE_URL\": \"$DATABASE_URL_ARN\",
              \"AUTH_SECRET\": \"$AUTH_SECRET_ARN\",
              \"HUBSPOT_CLIENT_SECRET\": \"$HUBSPOT_SECRET_ARN\"
            }
          }
        }
      }
    }" \
    --instance-configuration "{\"InstanceRoleArn\": \"$ROLE_ARN\"}" \
    --region "$AWS_REGION"
fi

log "Done. Once the service is RUNNING, fetch its URL with:"
log "  aws apprunner list-services --region $AWS_REGION --query \"ServiceSummaryList[?ServiceName=='${APP_NAME}'].ServiceUrl\" --output text"
log ""
log "SECURITY FOLLOW-UP: the RDS security group still allows $MY_IP/32 on :5432 for this migration run."
log "Remove that ingress rule once you've confirmed the app is healthy: RDS should only be reachable from"
log "App Runner via a VPC connector, not the public internet. See AWS_HOSTING_REQUEST.md for the access model."
