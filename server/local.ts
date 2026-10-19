import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readSiteConfig } from "../config/site.ts";
import { isMarketState } from "../functions/src/domain.ts";
import { GhlClient, UnconfiguredCrm, type ContactInput, type Crm, type Messaging, type OpportunityInput } from "../functions/src/ghl.ts";
import { ghlAuthMode } from "../config/site.ts";
import { dispatch, type HttpRequest } from "../functions/src/http.ts";
import type { Deps } from "../functions/src/handlers.ts";
import { MemoryStore } from "../functions/src/store.ts";
import type { Staff } from "../functions/src/store.ts";

const store = new MemoryStore();
const passwords = new Map<string, string>();
const sessionSecret = crypto.randomUUID();
const config = readSiteConfig();

class LocalMockCrm implements Crm, Messaging {
  async upsertContact(input: ContactInput) {
    return { contactId: `local-${input.email}` };
  }
  async createOpportunity(input: OpportunityInput) {
    return { opportunityId: `local-opp-${input.contactId}` };
  }
  async getOpportunityStage() {
    return { stage: "install_complete" as const, rawStageId: null, rawStageName: "Install complete" };
  }
  async sendEmail() {
    return { messageId: "local-email" };
  }
  async sendSms() {
    return { messageId: "local-sms" };
  }
}

const crm = process.env.LOCAL_MOCK_CRM === "true" ? new LocalMockCrm() : ghlAuthMode(config) === "unconfigured" ? new UnconfiguredCrm() : new GhlClient(config);

if (process.env.LOCAL_ADMIN_EMAIL && process.env.LOCAL_ADMIN_PASSWORD) {
  const admin: Staff = {
    id: "local-admin",
    email: process.env.LOCAL_ADMIN_EMAIL.trim().toLowerCase(),
    name: "Local admin",
    role: "Admin",
    twoFactorStatus: "off",
    status: "active",
    inviteTokenHash: null,
    inviteExpiresAt: null,
    createdAt: new Date().toISOString(),
  };
  await store.saveStaff(admin);
  passwords.set(admin.id, process.env.LOCAL_ADMIN_PASSWORD);
}

const coverage = (process.env.LOCAL_COVERAGE ?? "").split(",").map((item) => item.trim()).filter(Boolean);
for (const item of coverage) {
  const [zip, state] = item.split(":");
  if (zip && state && /^\d{5}$/.test(zip) && isMarketState(state)) await store.upsertCoverage([{ zip, state }]);
}

const deps: Deps = {
  store,
  crm,
  messaging: crm,
  config,
  now: () => new Date().toISOString(),
  nowMs: () => Date.now(),
  id: () => crypto.randomUUID(),
  appCheckRequired: false,
  verifyAppCheck: async () => true,
  createUser: async (email, password) => {
    const uid = crypto.randomUUID();
    passwords.set(uid, password);
    return { uid };
  },
};

function sign(id: string): string {
  const mac = createHmac("sha256", sessionSecret).update(id).digest("hex");
  return `${id}.${mac}`;
}

function readSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("session="))?.slice("session=".length);
  if (!raw) return null;
  const [id, mac] = raw.split(".");
  if (!id || !mac) return null;
  const expected = createHmac("sha256", sessionSecret).update(id).digest("hex");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return id;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "unknown");
    send(res, 500, { error: "Something went wrong." });
  }
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const raw = await readBody(req);
  let body: unknown = {};
  if (raw.length) {
    try { body = JSON.parse(raw.toString("utf8")); } catch { body = {}; }
  }
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
    const password = String((body as { password?: string }).password ?? "");
    const staff = await store.getStaffByEmail(email);
    if (!staff || passwords.get(staff.id) !== password || staff.status !== "active") {
      send(res, 401, { ok: false, error: "Sign-in failed." });
      return;
    }
    res.setHeader("Set-Cookie", `session=${sign(staff.id)}; HttpOnly; SameSite=Lax; Path=/`);
    send(res, 200, { ok: true });
    return;
  }
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  const request: HttpRequest = {
    method: req.method ?? "GET",
    path: url.pathname,
    body,
    rawBody: raw,
    headers,
    ip: req.socket.remoteAddress,
  };
  const result = await dispatch(deps, request, async (incoming) => {
    const id = readSession(incoming.headers.cookie);
    if (!id) return null;
    const staff = await store.getStaff(id);
    return staff ? { id: staff.id, email: staff.email } : null;
  });
  send(res, result.status, result.body);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const port = Number(process.env.PORT ?? 8787);
server.listen(port, "127.0.0.1");
console.log(`local api on ${port}`);
