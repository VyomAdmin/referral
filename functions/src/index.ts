import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { readSiteConfig } from "../../config/site.ts";
import { FirestoreStore } from "./firestore-store.ts";
import { GhlClient, UnconfiguredCrm } from "./ghl.ts";
import { ghlAuthMode } from "../../config/site.ts";
import { dispatch, type HttpRequest } from "./http.ts";
import { acceptInvite, reconcile, retryPending, type Deps } from "./handlers.ts";

// Safety cap, not a capacity plan. Change this constant when a real limit is chosen.
const MAX_INSTANCES = 10;
setGlobalOptions({ maxInstances: MAX_INSTANCES });

const privateToken = defineSecret("GHL_PRIVATE_INTEGRATION_TOKEN");
const clientSecret = defineSecret("GHL_CLIENT_SECRET");
const refreshToken = defineSecret("GHL_REFRESH_TOKEN");
const webhookKey = defineSecret("GHL_WEBHOOK_PUBLIC_KEY");

initializeApp();

function buildDeps(): Deps {
  const config = readSiteConfig({
    ...process.env,
    GHL_PRIVATE_INTEGRATION_TOKEN: process.env.GHL_PRIVATE_INTEGRATION_TOKEN || privateToken.value(),
    GHL_CLIENT_SECRET: process.env.GHL_CLIENT_SECRET || clientSecret.value(),
    GHL_REFRESH_TOKEN: process.env.GHL_REFRESH_TOKEN || refreshToken.value(),
    GHL_WEBHOOK_PUBLIC_KEY: process.env.GHL_WEBHOOK_PUBLIC_KEY || webhookKey.value(),
  });
  const crm = ghlAuthMode(config) === "unconfigured" ? new UnconfiguredCrm() : new GhlClient(config);
  return {
    store: new FirestoreStore(),
    crm,
    messaging: crm,
    config,
    now: () => new Date().toISOString(),
    nowMs: () => Date.now(),
    id: () => crypto.randomUUID(),
    appCheckRequired: Boolean(process.env.K_SERVICE) && process.env.APP_CHECK_ENFORCE !== "false",
    verifyAppCheck: async (token) => {
      if (!token) return false;
      const { getAppCheck } = await import("firebase-admin/app-check");
      try {
        await getAppCheck().verifyToken(token);
        return true;
      } catch {
        return false;
      }
    },
    createUser: async (email, password) => {
      const user = await getAuth().createUser({ email, password });
      return { uid: user.uid };
    },
  };
}

const secrets = [privateToken, clientSecret, refreshToken, webhookKey];

async function authenticate(request: HttpRequest) {
  const header = request.headers.authorization ?? request.headers.Authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAuth().verifyIdToken(header.slice("Bearer ".length));
    if (!decoded.email) return null;
    return { id: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

function fromNode(req: { method: string; path: string; body: unknown; rawBody?: Buffer; headers: Record<string, string | string[] | undefined>; ip?: string }): HttpRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  return { method: req.method, path: req.path, body: req.body, rawBody: req.rawBody, headers, ip: req.ip };
}

export const api = onRequest({ secrets, cors: false }, async (req, res) => {
  try {
    const result = await dispatch(buildDeps(), fromNode(req), authenticate);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[api]", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "Something went wrong." });
  }
});

export const acceptStaffInvite = onRequest({ secrets, cors: false }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const deps = buildDeps();
    const result = await acceptInvite(deps, req.body ?? {}, async (email, password) => {
      const user = await getAuth().createUser({ email, password });
      return { uid: user.uid };
    });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error("[invite]", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "Something went wrong." });
  }
});

export const retryCrmSync = onSchedule({ schedule: "every 60 minutes", secrets }, async () => {
  await retryPending(buildDeps());
});

export const nightlyReconcile = onSchedule({ schedule: "0 6 * * *", secrets, timeZone: "Etc/UTC" }, async () => {
  await reconcile(buildDeps());
});
