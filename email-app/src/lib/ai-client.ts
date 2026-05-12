export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AIProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ChatCompletionOptions = {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
};

export function looksLikeLocalOpenAiBase(baseUrl: string): boolean {
  return /127\.0\.0\.1|localhost/i.test(baseUrl);
}

export function looksLikeOllamaOpenAiBase(baseUrl: string): boolean {
  const u = baseUrl.replace(/\/$/, "");
  return /127\.0\.0\.1:11434\b|localhost:11434\b/i.test(u);
}

export function describeLocalAiUnreachable(baseUrl: string, cause: string): string {
  if (!looksLikeLocalOpenAiBase(baseUrl)) return cause;
  return (
    `Serveur IA injoignable (${baseUrl}). ` +
    `Ollama : « ollama serve », port 11434, « ollama list » = AI_MODEL. ` +
    `LM Studio : serveur local démarré (souvent :1234), modèle chargé = AI_MODEL. ` +
    `Préférez 127.0.0.1 à « localhost » sur Windows. Détail : ${cause}`
  );
}

function isLikelyFetchNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (!(e instanceof Error)) return false;
  const m = e.message;
  return /fetch failed|failed to fetch|econnrefused|enotfound|socket|network|fetch\(\)/i.test(
    m
  );
}

function extractAssistantContent(raw: unknown): string | null {
  if (raw == null) return null;
  const c = raw as Record<string, unknown>;
  const choice0 = (c.choices as unknown[] | undefined)?.[0] as
    | Record<string, unknown>
    | undefined;
  if (!choice0) return null;

  const msg = choice0.message as Record<string, unknown> | undefined;
  const content = msg?.content;

  if (typeof content === "string" && content.trim()) return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const p of content) {
      if (typeof p === "string") parts.push(p);
      else if (p && typeof p === "object") {
        const o = p as Record<string, unknown>;
        if (o.type === "text" && typeof o.text === "string") parts.push(o.text);
        else if (typeof o.content === "string") parts.push(o.content);
      }
    }
    const joined = parts.join("").trim();
    if (joined) return joined;
  }

  const legacy = choice0.text;
  if (typeof legacy === "string" && legacy.trim()) return legacy;

  return null;
}

function buildChatBody(
  config: AIProviderConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.65,
    stream: false,
  };
  if (typeof options?.maxTokens === "number") {
    body.max_tokens = options.maxTokens;
  }
  if (looksLikeOllamaOpenAiBase(config.baseUrl)) {
    body.reasoning_effort = "none";
    body.think = false;
  }
  return body;
}

export async function chatCompletion(
  messages: ChatMessage[],
  config: AIProviderConfig,
  options?: ChatCompletionOptions
): Promise<string> {
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const timeoutMs = options?.timeoutMs;
  const ctrl = typeof timeoutMs === "number" ? new AbortController() : null;
  const kill =
    ctrl && timeoutMs
      ? setTimeout(() => ctrl.abort(), timeoutMs)
      : undefined;

  const doFetch = async (body: Record<string, unknown>) => {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: ctrl?.signal,
      body: JSON.stringify(body),
    });
  };

  let res: Response;
  let text = "";
  try {
    let body = buildChatBody(config, messages, options);
    res = await doFetch(body);

    if (
      !res.ok &&
      looksLikeLocalOpenAiBase(config.baseUrl) &&
      typeof options?.maxTokens === "number"
    ) {
      const errText = await res.text();
      const retryBody = buildChatBody(config, messages, {
        ...options,
        maxTokens: undefined,
      });
      res = await doFetch(retryBody);
      if (!res.ok) {
        text = await res.text();
        let detail = text;
        try {
          const j = JSON.parse(text) as { error?: { message?: string } };
          if (j?.error?.message) detail = j.error.message;
        } catch {
          /* brut */
        }
        throw new Error(
          `${detail || `AI error ${res.status}`} (échec aussi sans max_tokens ; 1er essai : ${errText.slice(0, 200)})`
        );
      }
    } else if (!res.ok) {
      text = await res.text();
      let detail = text;
      try {
        const j = JSON.parse(text) as { error?: { message?: string } };
        if (j?.error?.message) detail = j.error.message;
      } catch {
        /* brut */
      }
      throw new Error(detail || `AI error ${res.status}`);
    }

    text = await res.text();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Délai IA dépassé (${Math.round((timeoutMs ?? 0) / 1000)} s). Vérifiez Ollama / le modèle.`
      );
    }
    if (isLikelyFetchNetworkError(e)) {
      throw new Error(
        describeLocalAiUnreachable(
          config.baseUrl,
          e instanceof Error ? e.message : String(e)
        )
      );
    }
    throw e;
  } finally {
    if (kill) clearTimeout(kill);
  }

  let data: unknown;
  try {
    data = JSON.parse(text!);
  } catch {
    const head = text!.trimStart();
    if (head.startsWith("data:") || head.includes("\n\ndata:")) {
      throw new Error(
        "Le serveur IA a renvoyé du flux SSE au lieu d’un JSON (Ollama / streaming)."
      );
    }
    throw new Error(`Réponse IA non-JSON : ${text!.slice(0, 240)}`);
  }

  const out = extractAssistantContent(data);
  if (out == null || out.trim() === "") {
    throw new Error(
      "Réponse IA vide — vérifiez ollama list / AI_MODEL."
    );
  }
  return out;
}
