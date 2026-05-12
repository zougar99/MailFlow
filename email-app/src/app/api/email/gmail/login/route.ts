import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { gmailOAuthAuthorizeUrl } from "@/lib/gmail-client";
import {
  googleOAuthCredentials,
  resolveGoogleRedirectUri,
} from "@/lib/oauth-env";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const creds = googleOAuthCredentials();
  if (!creds) {
    return NextResponse.redirect(`${origin}/?oauthErr=gmail_not_configured`);
  }

  const redirectUri = resolveGoogleRedirectUri(req);
  const state = randomBytes(24).toString("hex");
  const url = gmailOAuthAuthorizeUrl(creds.clientId, redirectUri, state);

  const res = NextResponse.redirect(url);
  res.cookies.set("ec_oauth_state_gmail", `gmail:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
