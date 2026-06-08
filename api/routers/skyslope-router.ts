import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";

const BASE = "https://api.skyslope.com";

// ── OAuth2 bearer token ───────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;
let discoveredTokenUrl: string | null = null;

async function getTokenUrl(): Promise<string> {
  if (discoveredTokenUrl) return discoveredTokenUrl;
  try {
    const res = await fetch(`${BASE}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const cfg = await res.json() as { token_endpoint?: string };
      if (cfg.token_endpoint) {
        discoveredTokenUrl = cfg.token_endpoint;
        return discoveredTokenUrl;
      }
    }
  } catch { /* fall through */ }
  discoveredTokenUrl = "https://identity.skyslope.com/connect/token";
  return discoveredTokenUrl;
}

async function getBearerToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const clientId = process.env.SKYSLOPE_CLIENT_ID ?? "";
  const clientSecret = process.env.SKYSLOPE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("SkySlope not configured — add SKYSLOPE_CLIENT_ID and SKYSLOPE_CLIENT_SECRET to Vercel env vars.");
  }

  const tokenUrl = await getTokenUrl();
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SkySlope auth failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token?: string; expires_in?: number };
  const token = data.access_token ?? "";
  if (!token) throw new Error("SkySlope auth returned no access token");

  const expiresIn = data.expires_in ?? 3600;
  tokenCache = { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return token;
}

async function skySlopeReq(path: string, options: RequestInit = {}) {
  const token = await getBearerToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
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

function pickFromResponse(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  const candidate = d?.value ?? d?.offices ?? d?.users ?? d?.checklistTypes ?? d?.items ?? [];
  return Array.isArray(candidate) ? candidate : [];
}

async function discoverIds(): Promise<DiscoveredIds> {
  if (discoveryCache && Date.now() < discoveryCache.expiresAt) return discoveryCache;

  // Office — first accessible office
  const officeEnv = process.env.SKYSLOPE_OFFICE_GUID ?? "";
  let officeGuid = officeEnv;
  if (!officeGuid) {
    const officeData = await skySlopeReq("/api/offices");
    const offices = pickFromResponse(officeData) as Array<{ officeGuid?: string; guid?: string }>;
    officeGuid = offices[0]?.officeGuid ?? offices[0]?.guid ?? "";
  }

  // Agent — look up by email if provided, else first user
  const agentEnv = process.env.SKYSLOPE_AGENT_GUID ?? "";
  let agentGuid = agentEnv;
  if (!agentGuid) {
    const email = process.env.SKYSLOPE_AGENT_EMAIL ?? "";
    const qs = email ? `?email=${encodeURIComponent(email)}` : "";
    const userData = await skySlopeReq(`/api/users${qs}`);
    const users = pickFromResponse(userData) as Array<{ userGuid?: string; guid?: string }>;
    agentGuid = users[0]?.userGuid ?? users[0]?.guid ?? "";
  }

  // Checklist type — first Sale type
  const checklistEnv = parseInt(process.env.SKYSLOPE_CHECKLIST_TYPE_ID ?? "0", 10);
  let checklistTypeId = checklistEnv;
  if (!checklistTypeId) {
    const clData = await skySlopeReq("/api/checklistTypes?transactionType=Sale");
    const types = pickFromResponse(clData) as Array<{ id?: number; checklistTypeId?: number }>;
    checklistTypeId = types[0]?.id ?? types[0]?.checklistTypeId ?? 0;
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
    const clientId = process.env.SKYSLOPE_CLIENT_ID ?? "";
    const clientSecret = process.env.SKYSLOPE_CLIENT_SECRET ?? "";
    return {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      fullyConfigured: !!(clientId && clientSecret),
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
      const items = pickFromResponse(data);
      return items.slice(0, 50) as unknown[];
    }),

  getOffices: publicQuery
    .query(async () => {
      const data = await skySlopeReq("/api/offices");
      const items = pickFromResponse(data);
      return items as Array<{ officeGuid: string; name: string }>;
    }),
});
