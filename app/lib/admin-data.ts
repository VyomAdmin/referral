export type ReferralStatus = "received" | "scheduled" | "installed" | "paid" | "cancelled";

export type AdminReferral = {
  id: string;
  code: string;
  referrer: string;
  referrerEmail: string;
  customer: string;
  customerEmail: string;
  phone: string;
  state: "AZ" | "FL" | "SC" | "CO";
  zip: string;
  status: ReferralStatus;
  hubspotDealId: string;
  hubspotStage: string;
  submittedAt: string;
  installedAt: string | null;
  rewardAmount: number;
  syncStatus: "synced" | "pending" | "error";
};

export const demoReferrals: AdminReferral[] = [
  { id: "REF-482190", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Priya Mehta", customerEmail: "priya@example.com", phone: "(602) 555-0189", state: "AZ", zip: "85001", status: "scheduled", hubspotDealId: "18492011", hubspotStage: "Appointment Scheduled", submittedAt: "Aug 10, 2026", installedAt: null, rewardAmount: 50, syncStatus: "synced" },
  { id: "REF-482041", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Carlos Ruiz", customerEmail: "carlos@example.com", phone: "(480) 555-0114", state: "AZ", zip: "85281", status: "installed", hubspotDealId: "18471220", hubspotStage: "Closed Won", submittedAt: "Aug 6, 2026", installedAt: "Aug 9, 2026", rewardAmount: 50, syncStatus: "synced" },
  { id: "REF-479812", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Avery Thomas", customerEmail: "avery@example.com", phone: "(623) 555-0160", state: "AZ", zip: "85250", status: "paid", hubspotDealId: "18398002", hubspotStage: "Closed Won", submittedAt: "Jul 24, 2026", installedAt: "Jul 29, 2026", rewardAmount: 50, syncStatus: "synced" },
  { id: "REF-482201", code: "NV-RK-1048", referrer: "Romy Kaur", referrerEmail: "romy@nuvisionautoglass.com", customer: "Maya Wilson", customerEmail: "maya@example.com", phone: "(305) 555-0131", state: "FL", zip: "33101", status: "received", hubspotDealId: "18492291", hubspotStage: "New Lead", submittedAt: "Aug 11, 2026", installedAt: null, rewardAmount: 50, syncStatus: "pending" },
  { id: "REF-480982", code: "NV-AT-7721", referrer: "Alex Turner", referrerEmail: "alex@example.com", customer: "Jordan Lee", customerEmail: "jordan@example.com", phone: "(843) 555-0147", state: "SC", zip: "29401", status: "cancelled", hubspotDealId: "18431552", hubspotStage: "Closed Lost", submittedAt: "Aug 1, 2026", installedAt: null, rewardAmount: 50, syncStatus: "synced" },
];

export const demoEmailEvents = [
  { id: "EM-10982", recipient: "priya@example.com", template: "Appointment scheduled", related: "REF-482190", status: "Delivered", sent: "Today, 11:42 AM" },
  { id: "EM-10981", recipient: "sandeep@example.com", template: "Referral received", related: "REF-482190", status: "Opened", sent: "Today, 10:16 AM" },
  { id: "EM-10980", recipient: "maya@example.com", template: "Request confirmation", related: "REF-482201", status: "Delivered", sent: "Today, 9:35 AM" },
  { id: "EM-10976", recipient: "carlos@example.com", template: "Installation completed", related: "REF-482041", status: "Clicked", sent: "Aug 9, 4:20 PM" },
];

export const demoTeam = [
  { name: "Sandeep Jha", email: "sandeep@nuvisionautoglass.com", role: "Owner", status: "Active", twoFactor: true },
  { name: "Mansi Patel", email: "mansi@nuvisionautoglass.com", role: "CRM Operations", status: "Active", twoFactor: true },
  { name: "Romy Kaur", email: "romy@nuvisionautoglass.com", role: "Marketing", status: "Active", twoFactor: false },
  { name: "Sebastian Green", email: "sebastian@nuvisionautoglass.com", role: "Rewards / Finance", status: "Invited", twoFactor: false },
];
