import { NextRequest, NextResponse } from "next/server";
import { unsealOAuthPayload } from "@/lib/oauth-crypto";
import {
  microsoftOAuthCredentials,
  requireEmailOAuthSecret,
} from "@/lib/oauth-env";

export async function GET(req: NextRequest) {
  const credentialsConfigured = microsoftOAuthCredentials() !== null;
  let secretOk = false;
  try {
    requireEmailOAuthSecret();
    secretOk = true;
  } catch {
    return NextResponse.json({
      connected: false,
      secretOk: false,
      credentialsConfigured,
      hint: "Ajoutez EMAIL_OAUTH_SECRET (≥ 16 caractères aléatoires) dans le .env de cette app Next, puis redémarrez le serveur.",
    });
  }
  const raw = req.cookies.get("ec_microsoft")?.value;
  if (!raw) {
    return NextResponse.json({
      connected: false,
      secretOk: true,
      credentialsConfigured,
      hint: credentialsConfigured
        ? "Cliquez sur « Se connecter avec Microsoft ». URI de redirection à déclarer dans Azure : " +
          `${new URL(req.url).origin}/api/email/microsoft/callback`
        : "Renseignez MICROSOFT_CLIENT_ID et MICROSOFT_CLIENT_SECRET dans le .env du serveur qui tourne.",
    });
  }
  const secret = requireEmailOAuthSecret();
  const p = unsealOAuthPayload(secret, raw);
  const rt = typeof p?.refresh_token === "string" ? p.refresh_token : "";
  return NextResponse.json({
    connected: rt.length > 0,
    secretOk: true,
    credentialsConfigured,
  });
}
