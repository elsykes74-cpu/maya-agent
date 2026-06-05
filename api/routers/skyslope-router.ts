import { createHmac } from 'crypto';
import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";

const BASE = "https://api.skyslope.com";

function getCreds() {
  return {
    accessKey: process.env.SKYSLOPE_ACCESS_KEY ?? "",
    accessSecret: process.env.SKYSLOPE_ACCESS_SECRET ?? "",
    clientId: process.env.SKYSLOPE_CLIENT_ID ?? "",
    clientSecret: process.env.SKYSLOPE_CLIENT_SECRET ?? "",
    officeGuid: process.env.SKYSLOPE_OFFICE_GUID ?? "",
    agentGuid: process.env.SKYSLOPE_AGENT_GUID ?? "",
    checklistTypeId: parseInt(process.env.SKYSLOPE_CHECKLIST_TYPE_ID ?? "0", 10),
  };
}

// In-memory session cache (valid 2 hours per SkySlope docs, we refresh at 1h55m)
let sessionCache: { token: string; expiresAt: number } | null = null;

async function getSessionToken(): Promise<string> {
  if (sessionCache && Date.now() < sessionCache.expiresAt) {
    return sessionCache.token;
  }

  const { accessKey, accessSecret, clientId, clientSecret } = getCreds();
  if (!accessKey || !accessSecret || !clientId || !clientSecret) {
    throw new Error(
      "SkySlope credentials incomplete. Add SKYSLOPE_ACCESS_SECRET, SKYSLOPE_CLIENT_ID, and SKYSLOPE_CLIENT_SECRET to Vercel env vars."
    );
  }

  const timestamp = new Date().toISOString();
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
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SkySlope auth failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const token: string = data.Session ?? data.session ?? data.token ?? "";
  if (!token) throw new Error("SkySlope auth returned no session token");

  // Cache for 1h55m (just under the 2-hour session lifetime)
  sessionCache = { token, expiresAt: Date.now() + 115 * 60 * 1000 };
  return token;
}

async function skySlopeReq(path: string, options: RequestInit = {}) {
  const token = await getSessionToken();
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
    throw new Error(`SkySlope ${res.status}: ${body.slice(0, 200)}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function parseAddress(address: string) {
  const parts = address.split(",").map(s => s.trim());
  const fullStreet = parts[0] || address;
  const city = parts[1] || "";
  const stateZipPart = parts[2] || "";

  // Split "142 Maple St" → streetNumber="142", streetAddress="Maple St"
  const streetMatch = fullStreet.match(/^(\S+)\s+(.+)$/);
  const streetNumber = streetMatch?.[1] ?? "0";
  const streetAddress = streetMatch?.[2] ?? fullStreet;

  const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5})?/);
  const state = stateZipMatch?.[1] ?? "MA";
  const zip = stateZipMatch?.[2] ?? "00000";

  return { streetNumber, streetAddress, city, state, zip };
}

export const skyslopeRouter = createRouter({
  configStatus: publicQuery.query(() => {
    const c = getCreds();
    return {
      hasAccessKey: !!c.accessKey,
      hasAccessSecret: !!c.accessSecret,
      hasClientId: !!c.clientId,
      hasClientSecret: !!c.clientSecret,
      hasOfficeGuid: !!c.officeGuid,
      hasAgentGuid: !!c.agentGuid,
      hasChecklistTypeId: c.checklistTypeId > 0,
      fullyConfigured: !!(
        c.accessKey && c.accessSecret && c.clientId && c.clientSecret &&
        c.officeGuid && c.agentGuid && c.checklistTypeId > 0
      ),
    };
  }),

  createTransaction: publicQuery
    .input(z.object({
      sellerName: z.string(),
      propertyAddress: z.string(),
      salePrice: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { officeGuid, agentGuid, checklistTypeId } = getCreds();
      if (!officeGuid || !agentGuid || !checklistTypeId) {
        throw new Error(
          "Missing SKYSLOPE_OFFICE_GUID, SKYSLOPE_AGENT_GUID, or SKYSLOPE_CHECKLIST_TYPE_ID in Vercel env vars."
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
      const items = Array.isArray(data) ? data : (data?.value ?? data?.sales ?? data?.items ?? []);
      return (items as unknown[]).slice(0, 50);
    }),

  getOffices: publicQuery
    .query(async () => {
      const data = await skySlopeReq("/api/offices");
      const items = Array.isArray(data) ? data : (data?.value ?? data?.offices ?? []);
      return items as Array<{ officeGuid: string; name: string }>;
    }),
});
