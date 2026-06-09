import { createHmac } from 'crypto';
import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";

const BASE = "https://api.skyslope.com";

function getCreds() {
  return {
    accessKey:    process.env.SKYSLOPE_ACCESS_KEY    ?? "",
    accessSecret: process.env.SKYSLOPE_ACCESS_SECRET ?? "",
    clientId:     process.env.SKYSLOPE_CLIENT_ID     ?? "",
    clientSecret: process.env.SKYSLOPE_CLIENT_SECRET ?? "",
  };
}

// ── HMAC session token (valid ~2h, refresh at 1h55m) ─────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getBearerToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const { accessKey, accessSecret, clientId, clientSecret } = getCreds();
  if (!accessKey || !accessSecret || !clientId || !clientSecret) {
    throw new Error(
      "SkySlope credentials incomplete — add SKYSLOPE_ACCESS_KEY, SKYSLOPE_ACCESS_SECRET, SKYSLOPE_CLIENT_ID, and SKYSLOPE_CLIENT_SECRET to Vercel env vars."
    );
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const hmac = createHmac('sha256', accessSecret)
    .update(`${clientId}:${clientSecret}:${timestamp}`)
    .digest('base64');

  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `SS ${accessKey}:${hmac}`,
      'Timestamp': timestamp,
    },
    body: JSON.stringify({ ClientId: clientId, ClientSecret: clientSecret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SkySlope auth failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const token = (data.Session ?? data.session ?? data.token ?? data.access_token ?? "") as string;
  if (!token) throw new Error("SkySlope auth returned no session token");

  tokenCache = { token, expiresAt: Date.now() + 115 * 60 * 1000 };
  return token;
}

async function skySlopeReq(path: string, options: RequestInit = {}) {
  const token = await getBearerToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SkySlope ${res.status}: ${body.slice(0, 300)}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ── Dynamic ID discovery (office, agent, checklist type) ──────────

interface DiscoveredIds { officeGuid: string; agentGuid: string; checklistTypeId: number }
let discoveryCache: (DiscoveredIds & { expiresAt: number }) | null = null;

function pickList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  const v = d?.value ?? d?.offices ?? d?.users ?? d?.checklistTypes ?? d?.items ?? [];
  return Array.isArray(v) ? v : [];
}

async function discoverIds(): Promise<DiscoveredIds> {
  if (discoveryCache && Date.now() < discoveryCache.expiresAt) return discoveryCache;

  const officeEnv = process.env.SKYSLOPE_OFFICE_GUID ?? "";
  let officeGuid = officeEnv;
  if (!officeGuid) {
    const d = await skySlopeReq("/api/offices");
    const list = pickList(d) as Array<{ officeGuid?: string; guid?: string }>;
    officeGuid = list[0]?.officeGuid ?? list[0]?.guid ?? "";
  }

  const agentEnv = process.env.SKYSLOPE_AGENT_GUID ?? "";
  let agentGuid = agentEnv;
  if (!agentGuid) {
    const email = process.env.SKYSLOPE_AGENT_EMAIL ?? "";
    const qs = email ? `?email=${encodeURIComponent(email)}` : "";
    const d = await skySlopeReq(`/api/users${qs}`);
    const list = pickList(d) as Array<{ userGuid?: string; guid?: string }>;
    agentGuid = list[0]?.userGuid ?? list[0]?.guid ?? "";
  }

  const checklistEnv = parseInt(process.env.SKYSLOPE_CHECKLIST_TYPE_ID ?? "0", 10);
  let checklistTypeId = checklistEnv;
  if (!checklistTypeId) {
    const d = await skySlopeReq("/api/checklistTypes?transactionType=Sale");
    const list = pickList(d) as Array<{ id?: number; checklistTypeId?: number }>;
    checklistTypeId = list[0]?.id ?? list[0]?.checklistTypeId ?? 0;
  }

  discoveryCache = { officeGuid, agentGuid, checklistTypeId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return discoveryCache;
}

// ── Address parser ────────────────────────────────────────────────

function parseAddress(address: string) {
  const parts = address.split(",").map(s => s.trim());
  const fullStreet = parts[0] || address;
  const city = parts[1] || "";
  const stateZipPart = parts[2] || "";
  const streetMatch = fullStreet.match(/^(\S+)\s+(.+)$/);
  const streetNumber = streetMatch?.[1] ?? "0";
  const streetAddress = streetMatch?.[2] ?? fullStreet;
  const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5})?/);
  const state = stateZipMatch?.[1] ?? "MA";
  const zip = stateZipMatch?.[2] ?? "00000";
  return { streetNumber, streetAddress, city, state, zip };
}

// ── Router ────────────────────────────────────────────────────────

export const skyslopeRouter = createRouter({
  configStatus: publicQuery.query(() => {
    const { accessKey, accessSecret, clientId, clientSecret } = getCreds();
    return {
      fullyConfigured: !!(accessKey && accessSecret && clientId && clientSecret),
    };
  }),

  createTransaction: publicQuery
    .input(z.object({
      sellerName: z.string(),
      propertyAddress: z.string(),
      salePrice: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { officeGuid, agentGuid, checklistTypeId } = await discoverIds();

      if (!officeGuid || !agentGuid || !checklistTypeId) {
        throw new Error(
          `SkySlope setup incomplete — could not resolve: ${[
            !officeGuid && "office",
            !agentGuid && "agent",
            !checklistTypeId && "checklist type",
          ].filter(Boolean).join(", ")}. Add SKYSLOPE_AGENT_EMAIL to Vercel env vars if agent lookup fails.`
        );
      }

      const addr = parseAddress(input.propertyAddress);
      const body = {
        officeGuid,
        agentGuid,
        checklistTypeId,
        salePrice: input.salePrice ?? null,
        property: {
          streetNumber: addr.streetNumber,
          streetAddress: addr.streetAddress,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
        },
      };

      const data = await skySlopeReq("/api/files/sales", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const saleGuid: string = data?.value?.saleGuid ?? data?.saleGuid ?? "";
      return { success: true, saleGuid };
    }),

  getSale: publicQuery
    .input(z.object({ saleGuid: z.string() }))
    .query(async ({ input }) => {
      const data = await skySlopeReq(`/api/files/sales/${input.saleGuid}`);
      return (data?.value ?? data) as Record<string, unknown>;
    }),

  listTransactions: publicQuery
    .query(async () => {
      const data = await skySlopeReq("/api/files/sales");
      return pickList(data).slice(0, 50) as unknown[];
    }),

  getOffices: publicQuery
    .query(async () => {
      const data = await skySlopeReq("/api/offices");
      return pickList(data) as Array<{ officeGuid: string; name: string }>;
    }),
});
