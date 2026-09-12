import { ProxyAgent, fetch as undiciFetch } from "undici";

const agents = new Map<string, ProxyAgent>();

/** Cached ProxyAgent per proxy URL (http://user:pass@host:port). */
export function getProxyAgent(proxyUrl: string | undefined): ProxyAgent | undefined {
  if (!proxyUrl) return undefined;
  let agent = agents.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    agents.set(proxyUrl, agent);
  }
  return agent;
}

/**
 * Drop-in fetch() that routes through an HTTP proxy when proxyUrl is set.
 *
 * Must use undici's own fetch with its ProxyAgent: the global fetch() rejects
 * a third-party dispatcher instance (UND_ERR_INVALID_ARG: invalid
 * onRequestStart method). Without a proxy URL this is just the global fetch.
 */
export function proxiedFetch(
  url: string,
  init: RequestInit = {},
  proxyUrl?: string,
): Promise<Response> {
  const agent = getProxyAgent(proxyUrl);
  if (!agent) return fetch(url, init);
  // undici's Response is structurally compatible with the DOM Response for
  // everything this codebase uses (ok, status, text(), json()).
  return undiciFetch(
    url,
    { ...init, dispatcher: agent } as Parameters<typeof undiciFetch>[1],
  ) as unknown as Promise<Response>;
}
