"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LabelRow = {
  name?: string;
  emails?: {
    index?: number;
    detectedSubject?: string;
    summary?: string;
    suggestedDepartment?: string;
    priority?: string;
  }[];
};

function normalizeGroups(data: Record<string, unknown> | null): LabelRow[] {
  if (!data || !Array.isArray(data.labels)) return [];
  return (data.labels as unknown[]).filter(
    (x): x is LabelRow =>
      x !== null && typeof x === "object" && typeof (x as LabelRow).name === "string"
  );
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

type Props = {
  fieldClass: string;
  language: string;
};

function formatOAuthQueryError(raw: string): string {
  const u = (() => {
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      return raw;
    }
  })();
  const known: Record<string, string> = {
    state_invalid:
      "OAuth : étape « state » invalide (cookie perdu ou URL différente). Utilise toujours la même origine (ex. http://localhost:4000) et réessaie « Se connecter ». Vérifie aussi que l’URI de redirection est autorisée pour ce port dans Google / Azure.",
    gmail_not_configured:
      "Gmail : renseigne GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans le .env du serveur.",
    gmail_no_refresh_token:
      "Gmail : pas de refresh token — révoque l’app dans ton compte Google (sécurité) puis reconnecte-toi.",
    microsoft_not_configured:
      "Outlook : renseigne MICROSOFT_CLIENT_ID et MICROSOFT_CLIENT_SECRET (Azure).",
    microsoft_no_refresh_token:
      "Outlook : pas de refresh token — reconnecte-toi (consentement compte Microsoft).",
  };
  return known[u] ?? known[raw] ?? u;
}

const fetchOpts: RequestInit = { credentials: "include" };

export default function ConnectedInboxPanel({ fieldClass, language }: Props) {
  const [banner, setBanner] = useState<string | null>(null);
  const [oauthBlocked, setOauthBlocked] = useState<string | null>(null);
  const [gmailHint, setGmailHint] = useState<string | null>(null);
  const [msHint, setMsHint] = useState<string | null>(null);
  const [gmailOk, setGmailOk] = useState(false);
  const [msOk, setMsOk] = useState(false);
  const [maxMessages, setMaxMessages] = useState(50);
  const [catalog, setCatalog] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastGmail, setLastGmail] = useState<{
    messageIds: string[];
    data: Record<string, unknown>;
  } | null>(null);
  const [lastMs, setLastMs] = useState<{
    messageIds: string[];
    data: Record<string, unknown>;
  } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [gRes, mRes] = await Promise.all([
        fetch("/api/email/gmail/status", fetchOpts),
        fetch("/api/email/microsoft/status", fetchOpts),
      ]);
      const g = (await gRes.json()) as Record<string, unknown>;
      const m = (await mRes.json()) as Record<string, unknown>;
      setGmailOk(!!g.connected);
      setMsOk(!!m.connected);
      const blocked =
        g.secretOk === false
          ? typeof g.hint === "string"
            ? g.hint
            : null
          : m.secretOk === false
            ? typeof m.hint === "string"
              ? m.hint
              : null
            : null;
      setOauthBlocked(blocked);
      setGmailHint(
        !blocked && !g.connected && typeof g.hint === "string" ? g.hint : null
      );
      setMsHint(
        !blocked && !m.connected && typeof m.hint === "string" ? m.hint : null
      );
    } catch {
      setGmailOk(false);
      setMsOk(false);
      setOauthBlocked(null);
      setGmailHint(null);
      setMsHint(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const err = p.get("oauthErr");
      const ok = p.get("connected");
      if (err) setBanner(`Connexion : ${formatOAuthQueryError(err)}`);
      if (ok) setBanner(`Compte connecté (${ok}).`);
      if (err || ok) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    refreshStatus();
  }, [refreshStatus]);

  const groupsGmail = useMemo(
    () => normalizeGroups(lastGmail?.data ?? null),
    [lastGmail]
  );
  const groupsMs = useMemo(() => normalizeGroups(lastMs?.data ?? null), [lastMs]);

  const runAnalyze = async (provider: "gmail" | "microsoft") => {
    const path =
      provider === "gmail" ? "/api/email/gmail/analyze" : "/api/email/microsoft/analyze";
    setBusy(`scan-${provider}`);
    setBanner(null);
    try {
      const res = await fetch(path, {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxMessages,
          language,
          labelsCatalog: catalog.trim() || undefined,
        }),
      });
      let j: Record<string, unknown>;
      try {
        j = (await res.json()) as Record<string, unknown>;
      } catch {
        throw new Error("Réponse serveur illisible (pas JSON).");
      }
      if (!res.ok) {
        throw new Error(typeof j.error === "string" ? j.error : "Échec analyse");
      }
      if (!j.data || typeof j.data !== "object") {
        throw new Error("Réponse IA incomplète (pas de champ data).");
      }
      const ids = Array.isArray(j.messageIds)
        ? (j.messageIds as string[])
        : [];
      if (provider === "gmail") {
        setLastGmail({
          messageIds: ids,
          data: j.data as Record<string, unknown>,
        });
      } else {
        setLastMs({
          messageIds: ids,
          data: j.data as Record<string, unknown>,
        });
      }
      setBanner(
        `${typeof j.messagesFetched === "number" ? j.messagesFetched : ids.length} messages analysés (${provider === "gmail" ? "Gmail" : "Outlook"}).`
      );
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const buildAssignments = (groups: LabelRow[]) => {
    const assignments: { index: number; labelName: string }[] = [];
    for (const g of groups) {
      const name = String(g.name || "").trim();
      if (!name) continue;
      for (const e of g.emails || []) {
        const idx = e.index;
        if (typeof idx !== "number" || idx < 1) continue;
        assignments.push({ index: idx, labelName: name });
      }
    }
    return assignments;
  };

  const runApply = async (provider: "gmail" | "microsoft") => {
    const payload =
      provider === "gmail"
        ? lastGmail
        : lastMs;
    if (!payload) {
      setBanner("Lance d’abord une analyse.");
      return;
    }
    const assignments = buildAssignments(
      normalizeGroups(payload.data)
    );
    if (assignments.length === 0) {
      setBanner("Aucune assignation à appliquer.");
      return;
    }
    const path =
      provider === "gmail" ? "/api/email/gmail/apply" : "/api/email/microsoft/apply";
    setBusy(`apply-${provider}`);
    try {
      const res = await fetch(path, {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds: payload.messageIds,
          assignments,
        }),
      });
      const j = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof j.error === "string" ? j.error : "Échec application");
      }
      const errCount = Array.isArray(j.errors) ? j.errors.length : 0;
      setBanner(
        `Appliqué : ${String(j.applied)} message(s).${errCount ? ` Avertissements : ${errCount}` : ""}`
      );
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const logout = async (provider: "gmail" | "microsoft") => {
    const path =
      provider === "gmail"
        ? "/api/email/gmail/logout"
        : "/api/email/microsoft/logout";
    await fetch(path, { ...fetchOpts, method: "POST" });
    if (provider === "gmail") setLastGmail(null);
    else setLastMs(null);
    refreshStatus();
    setBanner("Déconnecté.");
  };

  const section = "text-base font-semibold text-[var(--ink)]";
  const lead = "mt-1 text-sm text-[var(--muted)]";

  const renderTable = (
    groups: LabelRow[],
    data: Record<string, unknown> | null
  ) => {
    if (groups.length === 0) return null;
    const advice =
      data && typeof data.inboxAdvice === "string" ? data.inboxAdvice.trim() : "";
    return (
      <div className="mt-4 space-y-3">
        {advice ? (
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--surface)]/80 px-4 py-3 text-sm leading-relaxed text-[var(--ink)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              Conseils pour ta boîte
            </p>
            <p className="mt-2 text-[var(--muted)]">{advice}</p>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-[var(--stroke)]">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--stroke)] bg-[var(--surface)]/80">
                <th className="px-3 py-2 font-semibold">Libellé / catégorie</th>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Messages</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const rows = g.emails || [];
                return (
                  <tr key={`${g.name}-${gi}`} className="border-b border-[var(--stroke)] align-top">
                    <td className="px-3 py-2 font-medium text-[var(--accent)]">{String(g.name)}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{rows.length}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-1">
                        {rows.map((r, i) => (
                          <li key={`${g.name}-${r.index ?? i}`} className="text-xs">
                            <span className="text-[var(--muted)]">#{r.index ?? i + 1}</span>{" "}
                            {r.detectedSubject || "—"}
                            {r.summary ? (
                              <span className="block text-[var(--muted)]">{r.summary}</span>
                            ) : null}
                            <span className="text-[var(--muted)]">
                              {deptLabel(String(r.suggestedDepartment || "other"))}
                              {r.priority ? ` · ${r.priority}` : ""}
                            </span>
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
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--card)] shadow-sm">
      <div className="border-b border-[var(--stroke)] bg-[var(--surface)]/50 px-5 py-4 sm:px-6">
        <h2 className={section}>Boîte réelle (Gmail & Outlook)</h2>
        <p className={lead}>
          <strong className="font-medium text-[var(--ink)]">Rangement de la boîte uniquement :</strong>{" "}
          PlumeFlux n’envoie aucun e-mail (pas de rédaction ni SMTP). On lit les messages,
          l’IA propose des libellés (Gmail) ou des catégories (Outlook), tu appliques en un clic.
          Nombre max par scan pour limiter temps et quotas ; pour couvrir plus, relance ou augmente
          progressivement.
        </p>
        {oauthBlocked ? (
          <div className="mt-3 rounded-lg border border-amber-400/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100">
            <strong className="font-semibold">Configuration OAuth requise — </strong>
            {oauthBlocked}
          </div>
        ) : null}
        {banner ? (
          <p className="mt-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]">
            {banner}
          </p>
        ) : null}
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-6">
        <div>
          <label className="text-xs font-medium text-[var(--muted)]">
            Nombre max de messages à lire (par scan)
          </label>
          <input
            type="number"
            min={5}
            max={100}
            className={`${fieldClass} mt-1.5 max-w-[120px] text-sm`}
            value={maxMessages}
            onChange={(e) => setMaxMessages(Number(e.target.value) || 50)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--muted)]">
            Libellés imposés (optionnel, un par ligne)
          </label>
          <textarea
            className={`${fieldClass} mt-1.5 min-h-[64px] text-sm`}
            value={catalog}
            onChange={(e) => setCatalog(e.target.value)}
            placeholder={"Factures\nPromos\nTravail…"}
          />
        </div>

        <div className="rounded-xl border border-[var(--stroke)] p-4">
          <h3 className="font-medium text-[var(--ink)]">Gmail</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            API Google : lecture + libellés sur les messages existants — pas d’envoi.
          </p>
          {gmailHint ? (
            <p className="mt-2 rounded-lg bg-[var(--surface)]/90 px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              {gmailHint}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {!gmailOk ? (
              <a
                href="/api/email/gmail/login"
                className="inline-flex rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
              >
                Se connecter avec Google
              </a>
            ) : (
              <>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Connecté
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runAnalyze("gmail")}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busy === "scan-gmail" ? "Analyse…" : "Scanner & analyser (IA)"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !lastGmail}
                  onClick={() => runApply("gmail")}
                  className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                >
                  {busy === "apply-gmail" ? "Application…" : "Appliquer les libellés Gmail"}
                </button>
                <button
                  type="button"
                  onClick={() => logout("gmail")}
                  className="text-sm text-[var(--muted)] underline-offset-2 hover:underline"
                >
                  Déconnecter
                </button>
              </>
            )}
          </div>
          {renderTable(groupsGmail, lastGmail?.data ?? null)}
        </div>

        <div className="rounded-xl border border-[var(--stroke)] p-4">
          <h3 className="font-medium text-[var(--ink)]">Outlook / Microsoft 365</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Microsoft Graph : catégories sur les messages existants — pas d’envoi depuis l’app.
          </p>
          {msHint ? (
            <p className="mt-2 rounded-lg bg-[var(--surface)]/90 px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              {msHint}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {!msOk ? (
              <a
                href="/api/email/microsoft/login"
                className="inline-flex rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
              >
                Se connecter avec Microsoft
              </a>
            ) : (
              <>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Connecté
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runAnalyze("microsoft")}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busy === "scan-microsoft" ? "Analyse…" : "Scanner & analyser (IA)"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !lastMs}
                  onClick={() => runApply("microsoft")}
                  className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                >
                  {busy === "apply-microsoft"
                    ? "Application…"
                    : "Appliquer les catégories Outlook"}
                </button>
                <button
                  type="button"
                  onClick={() => logout("microsoft")}
                  className="text-sm text-[var(--muted)] underline-offset-2 hover:underline"
                >
                  Déconnecter
                </button>
              </>
            )}
          </div>
          {renderTable(groupsMs, lastMs?.data ?? null)}
        </div>

        <p className="text-xs leading-relaxed text-[var(--muted)]">
          <code className="rounded bg-[var(--surface)] px-1">EMAIL_OAUTH_SECRET</code>,{" "}
          <code className="rounded bg-[var(--surface)] px-1">GOOGLE_CLIENT_ID</code> /{" "}
          <code className="rounded bg-[var(--surface)] px-1">SECRET</code>, idem Microsoft — voir{" "}
          <code className="rounded bg-[var(--surface)] px-1">.env.example</code>. Si{" "}
          <code className="rounded bg-[var(--surface)] px-1">GOOGLE_REDIRECT_URI</code> est vide,
          l’URI utilisée est automatiquement{" "}
          <code className="rounded bg-[var(--surface)] px-1">…/api/email/gmail/callback</code> sur{" "}
          <strong className="text-[var(--ink)]">le même hôte et port</strong> que cette page : déclare
          cette URL exacte dans Google Cloud / Azure. Yahoo / IMAP : pas encore.
        </p>
      </div>
    </div>
  );
}
