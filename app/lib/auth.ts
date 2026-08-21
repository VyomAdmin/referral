import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { teamMembers, users } from "../../db/schema.ts";
import { verifyPassword } from "./password.ts";
import { verifyTotpCode } from "./totp.ts";
import { logAuditEvent } from "./audit.ts";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // vinext's middleware and route-handler layers have disagreed on whether a
  // production request is "secure" (one produced an http:// redirect on a
  // real HTTPS deployment), which left the two layers writing/reading
  // differently-prefixed cookie names. Forcing this removes the ambiguity —
  // App Runner always terminates real TLS in production, and localhost dev
  // (NODE_ENV !== "production") needs plain cookies since it's plain HTTP.
  useSecureCookies: process.env.NODE_ENV === "production",
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totpCode: {} },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        const totpCode = typeof credentials?.totpCode === "string" ? credentials.totpCode : "";
        if (!email || !password) return null;

        const db = getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;

        const [member] = await db.select().from(teamMembers).where(eq(teamMembers.userId, user.id)).limit(1);
        if (!member) return null;

        const audit = (action: string) => logAuditEvent({ actorId: user.id, action, targetType: "user", targetId: user.id, organizationId: member.organizationId });

        const passwordValid = await verifyPassword(password, user.passwordHash);
        if (!passwordValid) {
          await audit("login.failed");
          return null;
        }

        if (user.totpEnabled) {
          if (!user.totpSecret || !(await verifyTotpCode(user.totpSecret, totpCode))) {
            await audit("login.failed_totp");
            return null;
          }
        }

        await audit("login.success");

        return {
          id: user.id,
          email: user.email,
          name: member.name,
          role: member.role,
          organizationId: member.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string | undefined;
        session.user.organizationId = token.organizationId as string | undefined;
      }
      return session;
    },
  },
});

export function requireRole(session: { user?: { role?: string } } | null, allowedRoles: string[]) {
  return Boolean(session?.user?.role && allowedRoles.includes(session.user.role));
}
