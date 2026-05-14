import { env } from "../lib/env";

export interface GoogleAuthOptions {
  state?: string;
}

export function getGoogleAuthUrl(opts: GoogleAuthOptions = {}): string {
  const redirectUri = `${env.appUrl}/api/oauth/google/callback`;
  const state = opts.state ?? generateState();

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  idToken: string;
}> {
  const redirectUri = `${env.appUrl}/api/oauth/google/callback`;

  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const json = await res.json() as { access_token: string; id_token: string };
  return {
    accessToken: json.access_token,
    idToken: json.id_token,
  };
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google userinfo failed: ${err}`);
  }

  return res.json() as Promise<GoogleUserInfo>;
}
