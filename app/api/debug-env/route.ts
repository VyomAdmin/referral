export async function GET() {
  return Response.json({
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    authSecretLength: process.env.AUTH_SECRET?.length ?? 0,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasTrustHost: Boolean(process.env.AUTH_TRUST_HOST),
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
