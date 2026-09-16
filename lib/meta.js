// Job metadata is returned in an x-neves-meta header (base64-encoded JSON) so
// the image response stays raw bytes and nothing that already reads these
// routes has to change. Kept in lib/ rather than in a route file because the
// App Router only permits specific exports from a route module.

export function encodeMeta(meta) {
  const trimmed = { ...meta };
  if (trimmed.revisedPrompt && trimmed.revisedPrompt.length > 1200) {
    trimmed.revisedPrompt = trimmed.revisedPrompt.slice(0, 1200) + "\u2026";
  }
  const json = JSON.stringify(trimmed);
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(json)));
}

// Browser-side counterpart. UTF-8 safe.
export function decodeMeta(header) {
  if (!header) return null;
  try {
    const bin = atob(header);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
