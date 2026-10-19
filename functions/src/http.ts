import {
  acceptInvite,
  getPublicConfig,
  handleWebhook,
  importCoverage,
  integrationStatus,
  inviteStaff,
  markRewardPaid,
  quote,
  reconcile,
  requireAppCheck,
  retryPending,
  signup,
  staffSnapshot,
  trackCustomer,
  trackReferrer,
  updateCampaign,
  updateTemplates,
  type Actor,
  type Deps,
} from "./handlers.ts";

export type HttpRequest = {
  method: string;
  path: string;
  body: unknown;
  rawBody?: Buffer;
  headers: Record<string, string | undefined>;
  ip?: string;
};

export type HttpResponse = { status: number; body: unknown };

function text(headers: HttpRequest["headers"], name: string): string | undefined {
  return headers[name.toLowerCase()];
}

async function actor(deps: Deps, request: HttpRequest, authenticate: (request: HttpRequest) => Promise<Actor | null>): Promise<Actor | null> {
  return authenticate(request);
}

export async function dispatch(deps: Deps, request: HttpRequest, authenticate: (request: HttpRequest) => Promise<Actor | null>): Promise<HttpResponse> {
  const path = request.path.split("?")[0] ?? request.path;
  if (request.method === "GET" && path === "/api/config") return { status: 200, body: await getPublicConfig(deps, false) };
  if (request.method === "GET" && path === "/api/referrer-config") return { status: 200, body: await getPublicConfig(deps, true) };
  if (request.method === "POST" && (path === "/api/signup" || path === "/api/quote")) {
    const failure = await requireAppCheck(deps, text(request.headers, "x-firebase-appcheck"));
    if (failure) return { status: 401, body: { error: failure } };
  }
  const payload = (request.body ?? {}) as Record<string, unknown>;
  if (request.method === "POST" && path === "/api/signup") {
    const result = await signup(deps, { ...payload, ip: request.ip });
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/quote") {
    const result = await quote(deps, { ...payload, ip: request.ip });
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/track/referrer") {
    const result = await trackReferrer(deps, payload);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/track/customer") {
    const result = await trackCustomer(deps, payload);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/webhooks/ghl") {
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const signature = text(request.headers, "x-ghl-signature") ?? null;
    const result = await handleWebhook(deps, raw, signature);
    return { status: result.status, body: result.body };
  }
  const who = await actor(deps, request, authenticate);
  if (!who) return { status: 401, body: { error: "Sign in is required." } };
  if (request.method === "GET" && path === "/api/admin/snapshot") {
    const result = await staffSnapshot(deps, who);
    return { status: result.ok ? 200 : 403, body: result };
  }
  if (request.method === "GET" && path === "/api/admin/integrations") return { status: 200, body: await integrationStatus(deps) };
  if (request.method === "POST" && path === "/api/admin/campaign") {
    const result = await updateCampaign(deps, who, payload as never);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/admin/templates") {
    const result = await updateTemplates(deps, who, payload.templates as never);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/admin/rewards/paid") {
    const result = await markRewardPaid(deps, who, String(payload.rewardId ?? ""));
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/admin/invites") {
    const result = await inviteStaff(deps, who, payload);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/invites/accept") {
    const result = await acceptInvite(deps, payload, deps.createUser);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/admin/coverage") {
    const result = await importCoverage(deps, who, String(payload.csv ?? ""));
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (request.method === "POST" && path === "/api/jobs/retry") return { status: 200, body: await retryPending(deps) };
  if (request.method === "POST" && path === "/api/jobs/reconcile") return { status: 200, body: await reconcile(deps) };
  return { status: 404, body: { error: "Not found." } };
}
