const MS_SCOPE =
  "offline_access User.Read Mail.ReadWrite";

export function microsoftOAuthAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_SCOPE,
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p.toString()}`;
}

export async function microsoftExchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof j.error_description === "string"
        ? j.error_description
        : `Microsoft token ${res.status}`
    );
  }
  return j as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function microsoftRefreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof j.error_description === "string"
        ? j.error_description
        : `Microsoft refresh ${res.status}`
    );
  }
  return j as { access_token: string; expires_in: number };
}

export type GraphMessageSummary = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
};

export async function graphFetchSummaries(
  accessToken: string,
  count: number
): Promise<GraphMessageSummary[]> {
  const u = new URL("https://graph.microsoft.com/v1.0/me/messages");
  u.searchParams.set("$top", String(Math.min(count, 100)));
  u.searchParams.set(
    "$select",
    "id,subject,bodyPreview,from"
  );
  u.searchParams.set("$orderby", "receivedDateTime desc");
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as {
    value?: {
      id: string;
      subject?: string;
      bodyPreview?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
    }[];
    error?: { message: string };
  };
  if (!res.ok) {
    throw new Error(j.error?.message || `Graph messages ${res.status}`);
  }
  const rows = j.value || [];
  return rows.map((m) => {
    const addr = m.from?.emailAddress;
    const fromStr = addr
      ? `${addr.name || ""} <${addr.address || ""}>`.trim()
      : "";
    return {
      id: m.id,
      from: fromStr || "(expéditeur inconnu)",
      subject: m.subject || "(sans objet)",
      snippet: (m.bodyPreview || "").replace(/\s+/g, " ").trim().slice(0, 400),
    };
  });
}

export async function graphGetMessageCategories(
  accessToken: string,
  messageId: string
): Promise<string[]> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=categories`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const j = (await res.json()) as { categories?: string[]; error?: { message: string } };
  if (!res.ok) {
    throw new Error(j.error?.message || `Graph get categories ${res.status}`);
  }
  return Array.isArray(j.categories) ? j.categories : [];
}

export async function graphPatchMessageCategories(
  accessToken: string,
  messageId: string,
  categories: string[]
): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ categories }),
    }
  );
  if (res.ok) return;
  const j = (await res.json()) as { error?: { message: string } };
  throw new Error(j.error?.message || `Graph patch ${res.status}`);
}
