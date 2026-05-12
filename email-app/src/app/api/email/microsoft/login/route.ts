import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { microsoftOAuthAuthorizeUrl } from "@/lib/microsoft-graph-client";
import {
  microsoftOAuthCredentials,
  resolveMicrosoftRedirectUri,
} from "@/lib/oauth-env";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const creds = microsoftOAuthCredentials();
  if (!creds) {
    return NextResponse.redirect(`${origin}/?oauthErr=microsoft_not_configured`);
  }

  const redirectUri = resolveMicrosoftRedirectUri(req);
  const state = randomBytes(24).toString("hex");
  const url = microsoftOAuthAuthorizeUrl(creds.clientId, redirectUri, state);

  const res = NextResponse.redirect(url);
  res.cookies.set("ec_oauth_state_ms", `ms:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
