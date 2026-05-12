import { NextRequest, NextResponse } from "next/server";
import { gmailExchangeCode } from "@/lib/gmail-client";
import { sealOAuthPayload } from "@/lib/oauth-crypto";
import {
  googleOAuthCredentials,
  requireEmailOAuthSecret,
  resolveGoogleRedirectUri,
} from "@/lib/oauth-env";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const err = sp.get("error");

  if (err) {
    return NextResponse.redirect(`${origin}/?oauthErr=${encodeURIComponent(err)}`);
  }

  const cookieState = req.cookies.get("ec_oauth_state_gmail")?.value;
  if (!code || !state || !cookieState || cookieState !== `gmail:${state}`) {
    return NextResponse.redirect(`${origin}/?oauthErr=state_invalid`);
  }

  const creds = googleOAuthCredentials();
  if (!creds) {
    return NextResponse.redirect(`${origin}/?oauthErr=gmail_not_configured`);
  }

  const redirectUri = resolveGoogleRedirectUri(req);

  try {
    const secret = requireEmailOAuthSecret();
    const tokens = await gmailExchangeCode(
      code,
      creds.clientId,
      creds.clientSecret,
      redirectUri
    );
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${origin}/?oauthErr=gmail_no_refresh_token`
      );
    }

    const sealed = sealOAuthPayload(secret, {
      v: 1,
      provider: "gmail",
      refresh_token: tokens.refresh_token,
    });

    const res = NextResponse.redirect(`${origin}/?connected=gmail`);
    res.cookies.set("ec_oauth_state_gmail", "", { maxAge: 0, path: "/" });
    res.cookies.set("ec_gmail", sealed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth";
    return NextResponse.redirect(
      `${origin}/?oauthErr=${encodeURIComponent(msg.slice(0, 120))}`
    );
  }
}
