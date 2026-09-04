declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// Fire-and-forget: pushes a GTM custom event, no-op on the server or if GTM
// hasn't initialized dataLayer yet (it self-initializes it, but a page with
// the widget excluded — e.g. /admin — has no dataLayer at all).
export function pushGtmEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...data });
}
