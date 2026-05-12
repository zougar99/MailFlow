export function extractTitleFromArticle(md: string): { title: string; body: string } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0]?.trim() || "";
  if (/^\*\*Titre:\*\*\s*/i.test(first)) {
    const title = first.replace(/^\*\*Titre:\*\*\s*/i, "").replace(/\*\*/g, "").trim();
    return { title, body: lines.slice(1).join("\n").trim() };
  }
  if (first.startsWith("# ")) {
    return { title: first.slice(2).trim(), body: lines.slice(1).join("\n").trim() };
  }
  const h1 = lines.find((l) => l.trim().startsWith("# "));
  if (h1) {
    return {
      title: h1.trim().slice(2).trim(),
      body: lines.filter((l) => l !== h1).join("\n").trim(),
    };
  }
  return { title: "Article", body: md };
}
