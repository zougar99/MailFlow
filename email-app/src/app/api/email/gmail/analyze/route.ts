import { NextRequest, NextResponse } from "next/server";
import { analyzeInboxLabelBatch } from "@/lib/email-inbox-ai";
import { gmailFetchSummaries, gmailRefreshAccessToken } from "@/lib/gmail-client";
import { unsealOAuthPayload } from "@/lib/oauth-crypto";
import { googleOAuthCredentials, requireEmailOAuthSecret } from "@/lib/oauth-env";
import { getChatProviderConfigured } from "@/modules/server";

function collageFromSummaries(
  rows: { from: string; subject: string; snippet: string }[]
): string {
  return rows
    .map((r, i) => {
      const n = i + 1;
      return `---\n#${n}\nDe : ${r.from}\nObjet : ${r.subject}\nExtrait : ${r.snippet}`;
    })
    .join("\n\n");
}

async function gmailAccessFromCookie(req: NextRequest): Promise<string> {
  const secret = requireEmailOAuthSecret();
  const raw = req.cookies.get("ec_gmail")?.value;
  if (!raw) throw new Error("Non connecté à Gmail.");
  const p = unsealOAuthPayload(secret, raw);
  const rt = typeof p?.refresh_token === "string" ? p.refresh_token : "";
  if (!rt) throw new Error("Session Gmail invalide.");
  const creds = googleOAuthCredentials();
  if (!creds) throw new Error("Configuration Google absente.");
  const { access_token } = await gmailRefreshAccessToken(
    rt,
    creds.clientId,
    creds.clientSecret
  );
  return access_token;
}

export async function POST(req: NextRequest) {
  try {
    requireEmailOAuthSecret();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "secret";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let maxMessages = 50;
  let language = "fr";
  let labelsCatalog = "";
  try {
    const body = (await req.json()) as {
      maxMessages?: number;
      language?: string;
      labelsCatalog?: string;
    };
    if (typeof body.maxMessages === "number" && body.maxMessages > 0) {
      maxMessages = Math.min(100, Math.floor(body.maxMessages));
    }
    if (typeof body.language === "string") language = body.language;
    if (typeof body.labelsCatalog === "string") labelsCatalog = body.labelsCatalog;
  } catch {
    /* defaults */
  }

  try {
    const access = await gmailAccessFromCookie(req);
    const summaries = await gmailFetchSummaries(access, maxMessages);
    if (summaries.length === 0) {
      return NextResponse.json(
        { error: "Aucun message récupéré (boîte vide ou erreur d’accès)." },
        { status: 400 }
      );
    }
    const collage = collageFromSummaries(summaries);
    const aiCfg = getChatProviderConfigured();
    const data = await analyzeInboxLabelBatch(collage, labelsCatalog, language, aiCfg);

    return NextResponse.json({
      ok: true,
      provider: "gmail",
      messagesFetched: summaries.length,
      messageIds: summaries.map((s) => s.id),
      data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur analyse Gmail";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
