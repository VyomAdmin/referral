import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/index.ts";
import { users } from "../../../../db/schema.ts";
import { auth } from "../../../lib/auth";
import { generateTotpSecret, totpEnrollmentQrCode } from "../../../lib/totp";
import { TotpEnrollmentForm } from "./totp-enrollment-form";

export const metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [user] = await getDb().select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return null;

  return (
    <main className="admin-settings-page">
      <h1>Security</h1>
      {user.totpEnabled ? (
        <p>Two-factor authentication is enabled on your account.</p>
      ) : (
        <EnrollmentSection email={user.email} />
      )}
    </main>
  );
}

async function EnrollmentSection({ email }: { email: string }) {
  const secret = generateTotpSecret();
  const qrCodeDataUrl = await totpEnrollmentQrCode(email, secret);
  return <TotpEnrollmentForm secret={secret} qrCodeDataUrl={qrCodeDataUrl} />;
}
