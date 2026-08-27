// Generic outbound alert hook for operational failures that shouldn't sit
// silent until someone happens to open the admin dashboard. No-ops until
// OPS_ALERT_WEBHOOK_URL is configured (a Slack incoming webhook, a Zapier
// catch hook, PagerDuty Events API, etc. all accept a plain JSON POST) —
// intentionally vendor-agnostic rather than hardcoding one integration.
// Never throws: an alert failing to send must never break the caller.
export async function notifyOps(event: { type: string; summary: string; context?: Record<string, unknown> }) {
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[NuVision Referrals] ${event.summary}`, ...event }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error(`[ops-alerts] failed to send "${event.type}" alert:`, error);
  }
}
