"use client";

import { useState } from "react";
import ConnectedInboxPanel from "./components/ConnectedInboxPanel";
import EmailControlPanel from "./components/EmailControlPanel";

const field =
  "w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-[var(--ink)] placeholder:text-[var(--muted)]/70";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [article, setArticle] = useState("");
  const [language, setLanguage] = useState("fr");
  const [loading, setLoading] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <header className="border-b border-[var(--stroke)] pb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
          Suite MailFlow · app courriel dédiée
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Email Control
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          <strong className="font-medium text-[var(--ink)]">Ranger ta boîte</strong> (Gmail / Outlook) :
          connexion, scan, libellés ou catégories suggérés par l’IA, application en un clic.{" "}
          <strong className="font-medium text-[var(--ink)]">Aucun envoi d’e-mail</strong> depuis cette app.
          Même zone « boîte réelle » que{" "}
          <a
            href="http://localhost:3000/studio/canaux/courriel"
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Studio → Canaux → Courriel
          </a>
          . Variables OAuth / IA :{" "}
          <code className="rounded bg-[var(--code-bg)] px-1 text-xs">email-app/.env</code>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          Depuis le dossier parent :{" "}
          <code className="rounded bg-[var(--code-bg)] px-1">npm install</code> puis{" "}
          <code className="rounded bg-[var(--code-bg)] px-1">npm run dev:all</code> ou{" "}
          <code className="rounded bg-[var(--code-bg)] px-1">npm run dev:email</code>. Port par défaut{" "}
          <span className="text-[var(--ink)]">3001</span> — <code className="rounded bg-[var(--code-bg)] px-1">PORT</code> dans{" "}
          <code className="rounded bg-[var(--code-bg)] px-1">.env</code>.
        </p>
      </header>

      <div className="mt-8">
        <ConnectedInboxPanel fieldClass={field} language={language} />
      </div>

      <section className="mt-12 border-t border-[var(--stroke)] pt-10">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Optionnel — texte & assistant IA</h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Brouillons et analyses sur du texte collé ici ;{" "}
          <strong className="font-medium text-[var(--ink)]">aucun envoi automatique</strong> vers tes
          contacts.
        </p>
        <div className="mt-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">Sujet / contexte</label>
            <input
              className={`${field} mt-1.5 text-sm`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contexte pour classification ou brouillon local…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Texte source (notes, extrait, brouillon)
            </label>
            <textarea
              className={`${field} mt-1.5 min-h-[140px] text-sm`}
              value={article}
              onChange={(e) => setArticle(e.target.value)}
              placeholder="Colle du texte pour que l’IA propose un tri, un résumé ou un brouillon (fichier local uniquement)…"
            />
          </div>
          <label className="flex max-w-xs flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Langue</span>
            <select
              className={field}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        <div className="mt-8">
          <EmailControlPanel
            article={article}
            topic={topic}
            language={language}
            fieldClass={field}
            loading={loading}
            setLoading={setLoading}
          />
        </div>
      </section>
    </div>
  );
}
