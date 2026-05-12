import type { NextRequest } from "next/server";

export function requireEmailOAuthSecret(): string {
  const s = process.env.EMAIL_OAUTH_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error(
      "EMAIL_OAUTH_SECRET manquant ou trop court (min. 16 caractères aléatoires)."
    );
  }
  return s;
}

/** Identifiants Google uniquement (sans URI). */
export function googleOAuthCredentials():
  | { clientId: string; clientSecret: string }
  | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * URI de callback Gmail : variable d’env si définie, sinon origine de la requête
 * (évite state_invalid quand l’app tourne sur un autre port que .env).
 */
export function resolveGoogleRedirectUri(req: NextRequest): string {
  const fixed = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (fixed) return fixed;
  return `${new URL(req.url).origin}/api/email/gmail/callback`;
}

/** @deprecated Préférer googleOAuthCredentials + resolveGoogleRedirectUri(req) */
export function googleOAuthEnv():
  | { clientId: string; clientSecret: string; redirectUri: string }
  | null {
  const creds = googleOAuthCredentials();
  if (!creds) return null;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!redirectUri) return null;
  return { ...creds, redirectUri };
}

export function microsoftOAuthCredentials():
  | { clientId: string; clientSecret: string }
  | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function resolveMicrosoftRedirectUri(req: NextRequest): string {
  const fixed = process.env.MICROSOFT_REDIRECT_URI?.trim();
  if (fixed) return fixed;
  return `${new URL(req.url).origin}/api/email/microsoft/callback`;
}

/** @deprecated */
export function microsoftOAuthEnv():
  | { clientId: string; clientSecret: string; redirectUri: string }
  | null {
  const creds = microsoftOAuthCredentials();
  if (!creds) return null;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI?.trim();
  if (!redirectUri) return null;
  return { ...creds, redirectUri };
}
