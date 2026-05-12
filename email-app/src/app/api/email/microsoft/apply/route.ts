import { NextRequest, NextResponse } from "next/server";
import {
  graphGetMessageCategories,
  graphPatchMessageCategories,
  microsoftRefreshAccessToken,
} from "@/lib/microsoft-graph-client";
import { unsealOAuthPayload } from "@/lib/oauth-crypto";
import { microsoftOAuthCredentials, requireEmailOAuthSecret } from "@/lib/oauth-env";

type ApplyBody = {
  assignments: { index: number; labelName: string }[];
  messageIds: string[];
};

async function msAccessFromCookie(req: NextRequest): Promise<string> {
  const secret = requireEmailOAuthSecret();
  const raw = req.cookies.get("ec_microsoft")?.value;
  if (!raw) throw new Error("Non connecté à Microsoft / Outlook.");
  const p = unsealOAuthPayload(secret, raw);
  const rt = typeof p?.refresh_token === "string" ? p.refresh_token : "";
  if (!rt) throw new Error("Session Microsoft invalide.");
  const creds = microsoftOAuthCredentials();
  if (!creds) throw new Error("Configuration Microsoft absente.");
  const { access_token } = await microsoftRefreshAccessToken(
    rt,
    creds.clientId,
    creds.clientSecret
  );
  return access_token;
}

function mergeCategories(existing: string[], add: string): string[] {
  const t = add.trim().slice(0, 240);
  if (!t) return existing;
  const set = new Set(existing.map((x) => x.trim()).filter(Boolean));
  set.add(t);
  return Array.from(set).slice(0, 20);
}

export async function POST(req: NextRequest) {
  try {
    requireEmailOAuthSecret();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "secret";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.messageIds) || !Array.isArray(body.assignments)) {
    return NextResponse.json({ error: "messageIds et assignments requis." }, { status: 400 });
  }

  try {
    const access = await msAccessFromCookie(req);
    const errors: string[] = [];
    let applied = 0;

    for (const a of body.assignments) {
      const idx = a.index;
      const labelName = (a.labelName || "").trim();
      if (!labelName || idx < 1 || idx > body.messageIds.length) {
        errors.push(`Entrée invalide: index ${idx}`);
        continue;
      }
      const messageId = body.messageIds[idx - 1];
      if (!messageId) {
        errors.push(`Pas d’id pour l’index ${idx}`);
        continue;
      }

      try {
        const cur = await graphGetMessageCategories(access, messageId);
        const next = mergeCategories(cur, labelName);
        await graphPatchMessageCategories(access, messageId, next);
        applied += 1;
      } catch (e) {
        errors.push(
          `${messageId}: ${e instanceof Error ? e.message : "patch"}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      applied,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur application Outlook";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
