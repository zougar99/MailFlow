const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export function gmailOAuthAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function gmailExchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof j.error_description === "string"
        ? j.error_description
        : `Gmail token ${res.status}`
    );
  }
  return j as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function gmailRefreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof j.error_description === "string"
        ? j.error_description
        : `Gmail refresh ${res.status}`
    );
  }
  return j as { access_token: string; expires_in: number };
}

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
};

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const h = headers.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return (h?.value || "").trim();
}

export async function gmailListMessageIds(
  accessToken: string,
  maxResults: number,
  pageToken?: string
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const u = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  u.searchParams.set("maxResults", String(Math.min(maxResults, 100)));
  if (pageToken) u.searchParams.set("pageToken", pageToken);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as {
    messages?: { id: string }[];
    nextPageToken?: string;
    error?: { message: string };
  };
  if (!res.ok) {
    throw new Error(j.error?.message || `Gmail list ${res.status}`);
  }
  const ids = (j.messages || []).map((m) => m.id).filter(Boolean);
  return { ids, nextPageToken: j.nextPageToken };
}

export async function gmailGetMessageSummary(
  accessToken: string,
  id: string
): Promise<GmailMessageSummary> {
  const u = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`
  );
  u.searchParams.set("format", "metadata");
  u.searchParams.append("metadataHeaders", "Subject");
  u.searchParams.append("metadataHeaders", "From");
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[] };
    error?: { message: string };
  };
  if (!res.ok) {
    throw new Error(j.error?.message || `Gmail get ${res.status}`);
  }
  const headers = j.payload?.headers;
  return {
    id: j.id,
    threadId: j.threadId || j.id,
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject") || "(sans objet)",
    snippet: (j.snippet || "").replace(/\s+/g, " ").trim().slice(0, 400),
  };
}

export async function gmailFetchSummaries(
  accessToken: string,
  count: number
): Promise<GmailMessageSummary[]> {
  const { ids } = await gmailListMessageIds(accessToken, count);
  const slice = ids.slice(0, count);
  const out: GmailMessageSummary[] = [];
  for (const id of slice) {
    try {
      out.push(await gmailGetMessageSummary(accessToken, id));
    } catch {
      /* skip one bad message */
    }
  }
  return out;
}

export async function gmailListLabels(accessToken: string): Promise<
  { id: string; name: string; type: string }[]
> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as {
    labels?: { id: string; name: string; type: string }[];
    error?: { message: string };
  };
  if (!res.ok) throw new Error(j.error?.message || `Gmail labels ${res.status}`);
  return j.labels || [];
}

export async function gmailCreateUserLabel(
  accessToken: string,
  name: string
): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  const j = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok) throw new Error(j.error?.message || `Gmail create label ${res.status}`);
  if (!j.id) throw new Error("Libellé Gmail sans id");
  return j.id;
}

export async function gmailModifyLabels(
  accessToken: string,
  messageId: string,
  addLabelIds: string[]
): Promise<void> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds }),
    }
  );
  if (res.ok) return;
  const j = (await res.json()) as { error?: { message: string } };
  throw new Error(j.error?.message || `Gmail modify ${res.status}`);
}
