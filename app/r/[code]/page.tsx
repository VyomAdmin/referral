import { Brand } from "../../components/brand";
import { ReferralJourney } from "../../components/referral-journey";

export const metadata = {
  title: "You’ve been referred",
  description: "Start your NuVision windshield service with a referral.",
};

export default async function ReferredPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="referral-page">
      <header className="flow-header page-width">
        <Brand />
        <span className="secure-note">Secure referral • {code}</span>
      </header>
      <ReferralJourney code={code} />
    </main>
  );
}
