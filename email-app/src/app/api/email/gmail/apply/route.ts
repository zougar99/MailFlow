import { NextRequest, NextResponse } from "next/server";
import {
  gmailCreateUserLabel,
  gmailListLabels,
  gmailModifyLabels,
  gmailRefreshAccessToken,
} from "@/lib/gmail-client";
import { unsealOAuthPayload } from "@/lib/oauth-crypto";
import { googleOAuthCredentials, requireEmailOAuthSecret } from "@/lib/oauth-env";

type ApplyBody = {
  /** index 1-based → libellé à appliquer (un seul libellé utilisateur par message) */
  assignments: { index: number; labelName: string }[];
  messageIds: string[];
};

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
    const access = await gmailAccessFromCookie(req);
    const existing = await gmailListLabels(access);
    const nameToId = new Map<string, string>();
    for (const L of existing) {
      if (L.type === "user" && L.name) nameToId.set(L.name, L.id);
    }

    const errors: string[] = [];
    let applied = 0;

    for (const a of body.assignments) {
      const idx = a.index;
      const labelName = (a.labelName || "").trim();
      if (!labelName || idx < 1 || idx > body.messageIds.length) {
        errors.push(`Entrée invalide: index ${idx} / ${labelName}`);
        continue;
      }
      const messageId = body.messageIds[idx - 1];
      if (!messageId) {
        errors.push(`Pas d’id pour l’index ${idx}`);
        continue;
      }

      let labelId = nameToId.get(labelName);
      if (!labelId) {
        try {
          labelId = await gmailCreateUserLabel(access, labelName);
          nameToId.set(labelName, labelId);
        } catch (e) {
          errors.push(
            `${labelName}: ${e instanceof Error ? e.message : "création libellé"}`
          );
          continue;
        }
      }

      try {
        await gmailModifyLabels(access, messageId, [labelId]);
        applied += 1;
      } catch (e) {
        errors.push(
          `${messageId}: ${e instanceof Error ? e.message : "modify"}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      applied,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur application Gmail";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
