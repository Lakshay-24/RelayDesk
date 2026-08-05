import sanitizeHtml from "sanitize-html";

export function normalizeAddress(value: string): string {
  const bracketMatch = value.match(/<([^<>]+)>/);
  const address = (bracketMatch?.[1] || value).trim().toLowerCase();
  return address.replace(/^mailto:/, "");
}

export function inboundText(text?: string, html?: string): string | null {
  const plain = text?.trim();
  if (plain) return plain.slice(0, 100_000);

  if (!html?.trim()) return null;

  const cleaned = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/gi, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned ? cleaned.slice(0, 100_000) : null;
}
