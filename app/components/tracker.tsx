import Link from "next/link";
import { HeaderBrand } from "./brand";

export const publicStages = [
  { key: "received", label: "Referral received", helper: "The request reached NuVision." },
  { key: "scheduled", label: "Appointment scheduled", helper: "Service is on the calendar." },
  { key: "installed", label: "Installation completed", helper: "The glass installation is complete." },
  { key: "paid", label: "Reward paid", helper: "The referral reward was processed." },
] as const;

export function TrackerHeader({ label }: { label: string }) {
  return (
    <header className="tracker-header">
      <div className="page-width tracker-header-inner">
        <HeaderBrand />
        <div className="tracker-header-actions">
          <span>{label}</span>
          <Link href="/">Sign out</Link>
        </div>
      </div>
    </header>
  );
}

export function StatusTimeline({ activeIndex, customer = false }: { activeIndex: number; customer?: boolean }) {
  const stages = customer ? publicStages.slice(0, 3) : publicStages;
  return (
    <ol className="status-timeline">
      {stages.map((stage, index) => (
        <li className={index < activeIndex ? "stage-complete" : index === activeIndex ? "stage-current" : ""} key={stage.key}>
          <span className="stage-dot">{index < activeIndex ? "✓" : index + 1}</span>
          <div><strong>{stage.label}</strong><small>{stage.helper}</small></div>
        </li>
      ))}
    </ol>
  );
}

export function InvalidTracker() {
  return (
    <main className="tracker-page">
      <TrackerHeader label="Secure tracking" />
      <section className="invalid-tracker page-width">
        <span className="state-icon">!</span>
        <h1>This tracking link has expired.</h1>
        <p>For your privacy, tracking links expire. Request a fresh secure link using the email address registered with the referral.</p>
        <Link className="button button-primary" href="/">Request a new link</Link>
      </section>
    </main>
  );
}
