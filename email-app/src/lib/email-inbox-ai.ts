import type { AIProviderConfig } from "@/lib/ai-client";
import { chatCompletion } from "@/lib/ai-client";

export function buildInboxLabelBatchPrompt(
  inbox: string,
  labelsCatalog: string,
  lang: string
): string {
  const catalogBlock = labelsCatalog.trim()
    ? `Référentiel EXACT des noms de libellés (une ligne = un nom, orthographe identique). Chaque message doit être rangé sous exactement UN de ces noms :\n${labelsCatalog}\n`
    : `Invente des noms de libellés clairs et stables pour organiser une boîte mail personnelle (factures, promo, travail, perso, newsletters, réseaux sociaux, etc.) : courts, sans doublons quasi identiques.\n`;

  return `Tu analyses un collage de résumés d'e-mails réels (chaque bloc = un message de la boîte).

${catalogBlock}
Chaque message est numéroté #1, #2, … dans l'ordre. Utilise EXACTEMENT ces numéros dans le champ "index" de chaque entrée. Un message = un seul libellé.

JSON uniquement :
{
  "labels": [
    {
      "name": "Nom_du_libellé",
      "emails": [
        {
          "index": 1,
          "detectedSubject": "sujet ou titre court",
          "summary": "une phrase",
          "suggestedDepartment": "blog" | "youtube" | "email" | "other",
          "priority": "haute" | "normale" | "basse"
        }
      ]
    }
  ],
  "messageCount": 0,
  "inboxAdvice": "2 à 4 phrases : comment mieux structurer cette boîte au quotidien (règles simples, dossiers, désabonnements)."
}
"messageCount" = nombre total de messages (somme des entrées dans tous les libellés), doit correspondre au nombre de blocs fournis.
Langue des textes : ${lang}.

Collage :
${inbox}`;
}

export function parseAiJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as Record<string, unknown>;
}

export async function analyzeInboxLabelBatch(
  inbox: string,
  labelsCatalog: string,
  lang: string,
  cfg: AIProviderConfig
): Promise<Record<string, unknown>> {
  if (inbox.trim().length < 40) {
    throw new Error("Collage trop court pour l’analyse.");
  }
  const prompt = buildInboxLabelBatchPrompt(
    inbox.slice(0, 20000),
    labelsCatalog,
    lang
  );
  const raw = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Tu réponds uniquement par JSON valide, sans markdown ni texte autour.",
      },
      { role: "user", content: prompt },
    ],
    cfg
  );
  return parseAiJsonObject(raw);
}
