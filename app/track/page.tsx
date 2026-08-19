import { TrackerHeader } from "../components/tracker";
import { TrackerLookup } from "../components/tracker-lookup";

export const metadata = { title: "Find my tracker link" };

export default function TrackerLookupPage() {
  return (
    <main className="tracker-page">
      <TrackerHeader label="Track my referral" />
      <TrackerLookup />
    </main>
  );
}
