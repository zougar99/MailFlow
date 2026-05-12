import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai-client";
import { analyzeInboxLabelBatch } from "@/lib/email-inbox-ai";
import { getChatProviderConfigured } from "@/modules/server";

type Action = "classify" | "newsletter" | "triage" | "full" | "inboxLabelBatch";

type Body = {
  action: Action;
  article?: string;
  topic?: string;
  language?: string;
  inboxPaste?: string;
  labelsCatalog?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const action = body.action || "full";
    const lang = body.language || "fr";
    const article = (body.article || "").trim().slice(0, 14000);
    const topic = (body.topic || "").trim();
    const inboxRaw = (body.inboxPaste || "").trim();
    const inbox =
      action === "inboxLabelBatch"
        ? inboxRaw.slice(0, 20000)
        : inboxRaw.slice(0, 6000);

    if (action === "classify" && !article && !inbox && !topic) {
      return NextResponse.json(
        {
          error:
            "Fournissez au moins un sujet, un texte source ou un extrait de boîte mail.",
        },
        { status: 400 }
      );
    }

    if (action === "newsletter" && !article && !topic) {
      return NextResponse.json(
        { error: "Fournissez un texte source ou un sujet pour la newsletter." },
        { status: 400 }
      );
    }

    if (action === "full" && !article && !topic) {
      return NextResponse.json(
        { error: "Fournissez un texte source ou un sujet pour l’analyse." },
        { status: 400 }
      );
    }

    if (action === "triage" && !inbox) {
      return NextResponse.json(
        { error: "Collez un extrait d’e-mail pour le triage." },
        { status: 400 }
      );
    }

    if (action === "inboxLabelBatch" && inbox.length < 40) {
      return NextResponse.json(
        {
          error:
            "Collez au moins un bloc de texte suffisant (plusieurs e-mails ou un long fil).",
        },
        { status: 400 }
      );
    }

    const labelsCatalog = (body.labelsCatalog || "").trim();

    let cfg;
    try {
      cfg = getChatProviderConfigured();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Module IA non configuré";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const buildPrompt = (): string => {
      if (action === "triage" && inbox) {
        return `Tu es un assistant qui trie la boîte mail (créateur de contenu : article, vidéo, newsletter).
Réponds UNIQUEMENT par un JSON :
{
  "suggestedDepartment": "blog" | "youtube" | "email" | "other",
  "priority": "haute" | "normale" | "basse",
  "summary": "une phrase",
  "suggestedAction": "que faire concrètement",
  "replyDraft": "brouillon de réponse courte optionnel, ou chaîne vide",
  "tags": ["tag1","tag2"]
}
Langue des textes : ${lang}.

E-mail / extrait :
${inbox}`;
      }

      if (action === "newsletter") {
        return `À partir du texte / sujet, rédige une mini-newsletter.
JSON uniquement :
{
  "emailSubject": "sujet accrocheur",
  "emailBody": "corps en HTML simple (p, strong, br) max 400 mots",
  "preheader": "texte pré-en-tête inbox"
}
Langue : ${lang}.

Sujet : ${topic || "—"}
Texte source :
${article || "(vide)"}`;
      }

      if (action === "classify") {
        return `Classe ce contenu pour un créateur (blog vs vidéo vs newsletter).
JSON uniquement :
{
  "primaryDepartment": "blog" | "youtube" | "email",
  "confidence": 0.0 à 1.0,
  "reason": "courte explication",
  "youtubeHook": "accroche 1 ligne si YouTube pertinent, sinon vide",
  "suggestedTags": ["..."]
}
Langue des chaînes : ${lang}.

Sujet : ${topic || "—"}
Contenu :
${article || inbox || "(vide)"}`;
      }

      return `Analyse sujet + texte source et produis un JSON unique :
{
  "primaryDepartment": "blog" | "youtube" | "email",
  "confidence": 0-1,
  "reason": "pourquoi cette section",
  "emailSubject": "si newsletter utile",
  "emailBody": "corps HTML simple court ou vide",
  "youtubeHook": "accroche vidéo ou vide",
  "suggestedTags": ["..."],
  "nextSteps": ["action 1", "action 2"]
}
Langue : ${lang}.

Sujet : ${topic || "—"}
Texte :
${article || "(vide)"}`;
    };

    if (action === "inboxLabelBatch") {
      const parsed = await analyzeInboxLabelBatch(inbox, labelsCatalog, lang, cfg);
      return NextResponse.json({ ok: true, action, data: parsed });
    }

    const raw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Tu réponds uniquement par JSON valide, sans markdown ni texte autour.",
        },
        { role: "user", content: buildPrompt() },
      ],
      cfg
    );

    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as Record<
      string,
      unknown
    >;

    return NextResponse.json({ ok: true, action, data: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur hub IA";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
