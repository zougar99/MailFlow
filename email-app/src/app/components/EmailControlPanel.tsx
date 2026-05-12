"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadHubQueue,
  pushHubQueue,
  removeHubQueueItem,
  type HubQueueItem,
} from "@/lib/hub-queue";
import { extractTitleFromArticle } from "@/lib/markdown-to-html";

type Props = {
  article: string;
  topic: string;
  language: string;
  fieldClass: string;
  loading: string | null;
  setLoading: (v: string | null) => void;
};

function tryParseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw || raw.startsWith("{") === false) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function deptLabel(code: string): string {
  const m: Record<string, string> = {
    blog: "Article / blog",
    youtube: "Vidéo",
    email: "Courriel",
    other: "Autre",
  };
  return m[code] ?? code;
}

type LabeledEmailRow = {
  index?: number;
  detectedSubject?: string;
  summary?: string;
  suggestedDepartment?: string;
  priority?: string;
};

type LabelGroupRow = {
  name?: string;
  emails?: LabeledEmailRow[];
};

function normalizeLabelGroups(raw: Record<string, unknown> | null): LabelGroupRow[] {
  if (!raw || !Array.isArray(raw.labels)) return [];
  return (raw.labels as unknown[]).filter(
    (x): x is LabelGroupRow =>
      x !== null &&
      typeof x === "object" &&
      typeof (x as LabelGroupRow).name === "string"
  );
}

export default function EmailControlPanel({
  article,
  topic,
  language,
  fieldClass,
  loading,
  setLoading,
}: Props) {
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [inboxPaste, setInboxPaste] = useState("");
  const [inboxBatchPaste, setInboxBatchPaste] = useState("");
  const [labelsCatalogBatch, setLabelsCatalogBatch] = useState("");
  const [agentRaw, setAgentRaw] = useState<string | null>(null);
  const [queue, setQueue] = useState<HubQueueItem[]>([]);

  useEffect(() => {
    setQueue(loadHubQueue());
  }, []);

  const busy = loading !== null;
  const refreshQueue = () => setQueue(loadHubQueue());

  const parsedHint = useMemo(() => tryParseObject(agentRaw), [agentRaw]);
  const labelGroups = useMemo(() => normalizeLabelGroups(parsedHint), [parsedHint]);

  const runHub = useCallback(
    async (
      action: "classify" | "newsletter" | "triage" | "full" | "inboxLabelBatch"
    ) => {
      setLoading("hub");
      setAgentRaw(null);
      try {
        const res = await fetch("/api/ai/hub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            article,
            topic,
            language,
            inboxPaste:
              action === "triage"
                ? inboxPaste
                : action === "inboxLabelBatch"
                  ? inboxBatchPaste
                  : undefined,
            labelsCatalog:
              action === "inboxLabelBatch" && labelsCatalogBatch.trim()
                ? labelsCatalogBatch.trim()
                : undefined,
          }),
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || "Service indisponible");
        setAgentRaw(JSON.stringify(out.data, null, 2));
        const d = out.data as Record<string, unknown>;
        if (action === "newsletter" || action === "full") {
          if (typeof d.emailSubject === "string") setEmailSubject(d.emailSubject);
          if (typeof d.emailBody === "string") setEmailBody(d.emailBody);
        }
      } catch (e) {
        setAgentRaw(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(null);
      }
    },
    [article, topic, language, inboxPaste, inboxBatchPaste, labelsCatalogBatch, setLoading]
  );

  const addLabeledBatchToQueue = () => {
    for (const g of labelGroups) {
      const name = String(g.name || "Sans libellé");
      const emails = Array.isArray(g.emails) ? g.emails : [];
      for (const row of emails) {
        const title =
          typeof row.detectedSubject === "string" && row.detectedSubject.trim()
            ? row.detectedSubject.trim()
            : `Message #${row.index ?? "?"}`;
        const dept =
          typeof row.suggestedDepartment === "string" ? row.suggestedDepartment : "other";
        const sum = typeof row.summary === "string" ? row.summary.trim() : "";
        pushHubQueue({
          department: dept,
          title: `[${name}] ${title}`,
          preview: sum || title,
        });
      }
    }
    refreshQueue();
  };

  const addCurrentToQueue = () => {
    const { title } = extractTitleFromArticle(article);
    const t = title || topic || "Sans titre";
    let dept = "blog";
    try {
      if (agentRaw && agentRaw.startsWith("{")) {
        const p = JSON.parse(agentRaw) as {
          primaryDepartment?: string;
          suggestedDepartment?: string;
        };
        if (p.primaryDepartment) dept = p.primaryDepartment;
        else if (p.suggestedDepartment) dept = p.suggestedDepartment;
      }
    } catch {
      /* ignore */
    }
    const previewSource = article.trim() || topic;
    pushHubQueue({
      department: dept,
      title: t,
      preview: previewSource.slice(0, 160),
    });
    refreshQueue();
  };

  const sectionTitle = "text-base font-semibold text-[var(--ink)]";
  const sectionLead = "mt-1 text-sm text-[var(--muted)]";
  const hasSource = article.trim().length > 0 || topic.trim().length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--card)] shadow-sm">
      {!article.trim() ? (
        <div className="border-b border-[var(--stroke)] bg-[var(--surface)]/60 px-5 py-4 text-sm text-[var(--muted)]">
          Aucun texte source ci-dessus : la newsletter et la classification avancée
          attendent un corps ou un sujet. Le tri d’un message collé et l’analyse par
          libellés (lot) fonctionnent sans.
        </div>
      ) : null}

      <div className="divide-y divide-[var(--stroke)]">
        <section className="px-5 py-6 sm:px-6">
          <h2 className={sectionTitle}>Newsletter</h2>
          <p className={sectionLead}>
            Proposition de sujet et de corps à partir de votre texte. Aucun envoi depuis cette
            app : brouillon local uniquement ; envoi éventuel depuis ton client mail, par toi.
          </p>
          <button
            type="button"
            disabled={busy || !article.trim()}
            onClick={() => runHub("newsletter")}
            className="mt-5 w-full rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white disabled:opacity-40 sm:w-auto"
          >
            {loading === "hub" ? "Préparation…" : "Proposer un brouillon"}
          </button>
          <label className="mt-5 block text-xs font-medium text-[var(--muted)]">Objet</label>
          <input
            className={`${fieldClass} mt-1.5 text-sm`}
            placeholder="Objet visible dans la boîte du destinataire"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
          />
          <label className="mt-4 block text-xs font-medium text-[var(--muted)]">
            Message (HTML simple)
          </label>
          <textarea
            className={`${fieldClass} mt-1.5 min-h-[160px] text-sm`}
            placeholder="Corps du message…"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
          />
          <button
            type="button"
            disabled={!emailSubject && !emailBody}
            onClick={() => {
              const blob = new Blob([`Subject: ${emailSubject}\n\n${emailBody}`], {
                type: "text/plain",
              });
              const u = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = u;
              a.download = "brouillon-courriel.txt";
              a.click();
              URL.revokeObjectURL(u);
            }}
            className="mt-3 text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Enregistrer le brouillon sur l’ordinateur
          </button>
        </section>

        <section className="px-5 py-6 sm:px-6">
          <h2 className={sectionTitle}>Messages reçus</h2>
          <p className={sectionLead}>
            Collez un e-mail : idée de réponse courte et repères (priorité, type d’action).
          </p>
          <textarea
            className={`${fieldClass} mt-4 min-h-[120px] text-sm`}
            value={inboxPaste}
            onChange={(e) => setInboxPaste(e.target.value)}
            placeholder="Collez ici le texte du message…"
          />
          <button
            type="button"
            disabled={busy || !inboxPaste.trim()}
            onClick={() => runHub("triage")}
            className="mt-4 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--ink)] disabled:opacity-40 sm:w-auto"
          >
            Aider à répondre
          </button>
        </section>

        <section className="px-5 py-6 sm:px-6">
          <h2 className={sectionTitle}>Contrôle boîte (plusieurs e-mails)</h2>
          <p className={sectionLead}>
            Collez plusieurs messages ou un fil entier (séparez avec{" "}
            <code className="rounded bg-[var(--surface)] px-1">---</code> ou des sauts de
            ligne). L’IA détecte chaque message et les range sous des libellés nommés.
          </p>
          <label className="mt-4 block text-xs font-medium text-[var(--muted)]">
            Collage (lot)
          </label>
          <textarea
            className={`${fieldClass} mt-1.5 min-h-[160px] text-sm font-mono`}
            value={inboxBatchPaste}
            onChange={(e) => setInboxBatchPaste(e.target.value)}
            placeholder={"E-mail 1…\n---\nE-mail 2…"}
          />
          <label className="mt-4 block text-xs font-medium text-[var(--muted)]">
            Noms de libellés imposés (optionnel, une ligne = un nom)
          </label>
          <textarea
            className={`${fieldClass} mt-1.5 min-h-[72px] text-sm`}
            value={labelsCatalogBatch}
            onChange={(e) => setLabelsCatalogBatch(e.target.value)}
            placeholder={"Factures\nSupport\nNewsletters\n…"}
          />
          <button
            type="button"
            disabled={busy || inboxBatchPaste.trim().length < 40}
            onClick={() => runHub("inboxLabelBatch")}
            className="mt-4 w-full rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white disabled:opacity-40 sm:w-auto"
          >
            {loading === "hub" ? "Analyse des libellés…" : "Analyser et classer par libellés"}
          </button>
        </section>

        <section className="px-5 py-6 sm:px-6">
          <h2 className={sectionTitle}>Organisation du contenu</h2>
          <p className={sectionLead}>
            Indications pour savoir si le texte va plutôt vers un article, une vidéo ou un
            envoi par e-mail.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={busy || !article.trim()}
              onClick={() => runHub("full")}
              className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Vue d’ensemble + idées d’e-mail
            </button>
            <button
              type="button"
              disabled={busy || !hasSource}
              onClick={() => runHub("classify")}
              className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--ink)] disabled:opacity-40"
            >
              Indication rapide seulement
            </button>
          </div>
        </section>

        {agentRaw ? (
          <section className="px-5 py-6 sm:px-6">
            <h2 className={sectionTitle}>Résultat</h2>
            {labelGroups.length > 0 ? (
              <div className="mt-4 space-y-4">
                {typeof parsedHint?.messageCount === "number" ? (
                  <p className="text-sm text-[var(--muted)]">
                    Messages détectés :{" "}
                    <span className="font-medium text-[var(--ink)]">{parsedHint.messageCount}</span>
                  </p>
                ) : null}
                <div className="overflow-x-auto rounded-xl border border-[var(--stroke)]">
                  <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--stroke)] bg-[var(--surface)]/80">
                        <th className="px-3 py-2.5 font-semibold text-[var(--ink)]">
                          Libellé (nom)
                        </th>
                        <th className="px-3 py-2.5 font-semibold text-[var(--ink)]">#</th>
                        <th className="px-3 py-2.5 font-semibold text-[var(--ink)]">Messages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labelGroups.map((g, gi) => {
                        const rows = Array.isArray(g.emails) ? g.emails : [];
                        return (
                          <tr
                            key={`${String(g.name)}-${gi}`}
                            className="border-b border-[var(--stroke)] align-top last:border-b-0"
                          >
                            <td className="max-w-[180px] px-3 py-3 font-medium text-[var(--accent)]">
                              {String(g.name)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">
                              {rows.length}
                            </td>
                            <td className="px-3 py-3">
                              <ul className="space-y-2 text-[var(--ink)]">
                                {rows.map((r, i) => (
                                  <li
                                    key={`${g.name}-${r.index ?? i}`}
                                    className="rounded-lg bg-[var(--surface)]/60 px-3 py-2"
                                  >
                                    <span className="text-xs text-[var(--muted)]">
                                      #{r.index ?? i + 1}
                                    </span>{" "}
                                    <span className="font-medium">
                                      {typeof r.detectedSubject === "string"
                                        ? r.detectedSubject
                                        : "Sans sujet"}
                                    </span>
                                    {typeof r.summary === "string" && r.summary.trim() ? (
                                      <p className="mt-1 text-sm text-[var(--muted)]">{r.summary}</p>
                                    ) : null}
                                    <p className="mt-1 text-xs text-[var(--muted)]">
                                      {deptLabel(String(r.suggestedDepartment || "other"))}
                                      {typeof r.priority === "string"
                                        ? ` · priorité ${r.priority}`
                                        : ""}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={addLabeledBatchToQueue}
                  className="rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
                >
                  Envoyer tout vers la liste locale
                </button>
              </div>
            ) : null}
            {parsedHint && typeof parsedHint.inboxAdvice === "string" && parsedHint.inboxAdvice.trim() ? (
              <div className="mt-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--surface)]/80 px-4 py-3 text-sm text-[var(--ink)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Conseils boîte mail
                </p>
                <p className="mt-2 text-[var(--muted)]">{parsedHint.inboxAdvice}</p>
              </div>
            ) : null}
            {parsedHint && typeof parsedHint.summary === "string" && parsedHint.summary ? (
              <p className="mt-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)]">
                {parsedHint.summary}
              </p>
            ) : null}
            {parsedHint && typeof parsedHint.replyDraft === "string" && parsedHint.replyDraft ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-[var(--muted)]">Brouillon de réponse</p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]">
                  {parsedHint.replyDraft}
                </p>
              </div>
            ) : null}
            {parsedHint &&
            (typeof parsedHint.primaryDepartment === "string" ||
              typeof parsedHint.suggestedDepartment === "string") ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Orientation suggérée :{" "}
                <span className="font-medium text-[var(--ink)]">
                  {deptLabel(
                    String(
                      parsedHint.primaryDepartment ??
                        parsedHint.suggestedDepartment ??
                        ""
                    )
                  )}
                </span>
              </p>
            ) : null}

            <details className="mt-4 rounded-xl border border-[var(--stroke)] bg-[var(--surface)]/40 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--muted)]">
                Afficher le détail technique
              </summary>
              <pre className="mt-3 max-h-56 overflow-auto text-xs leading-relaxed text-[var(--ink)]">
                {agentRaw}
              </pre>
            </details>
          </section>
        ) : null}

        <section className="px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className={sectionTitle}>Liste locale</h2>
              <p className={sectionLead}>
                Repères enregistrés dans ce navigateur ({queue.length}).
              </p>
            </div>
            <button
              type="button"
              disabled={!hasSource}
              onClick={addCurrentToQueue}
              className="shrink-0 rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-40"
            >
              Mémoriser le texte / sujet
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {queue.map((q) => (
              <li
                key={q.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface)]/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-[var(--accent)]">{deptLabel(q.department)}</p>
                  <p className="font-medium text-[var(--ink)]">{q.title}</p>
                  <p className="line-clamp-2 text-sm text-[var(--muted)]">{q.preview}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--stroke)]/50 hover:text-red-700"
                  aria-label="Retirer"
                  onClick={() => {
                    removeHubQueueItem(q.id);
                    refreshQueue();
                  }}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
