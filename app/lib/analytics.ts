declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Fire-and-forget analytics event. No-ops on the server, and on pages where the
// tag isn't loaded (e.g. /admin) there's simply no gtag to call.
//
// Pushed to BOTH: gtag() is what actually reports to GA4 now that the referral
// site loads GA4 directly instead of the main site's GTM container, and the
// dataLayer push is kept so re-pointing at GTM later needs no changes here.
export function pushGtmEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...data });
  window.gtag?.("event", event, data ?? {});
}
