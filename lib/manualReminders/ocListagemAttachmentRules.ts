/** Limite compatível com corpos HTTP típicos (Netlify/hosting). */
export const OC_LISTAGEM_MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function isOcListagemAttachmentMimeAccepted(mime: string): boolean {
  const m = mime.trim().toLowerCase().split(";")[0];
  return ALLOWED.has(m);
}

export function safeOcListagemFilename(original: string, maxLen = 220): string {
  const nome =
    original
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.trim() || "listagem-oc";
  const sanitized = nome.replace(/[\0\r\n\t<>:"|?*]/g, "_").replace(/\s+/g, " ").trim();
  const fall = sanitized.length ? sanitized : "listagem-oc";
  return fall.slice(0, Math.min(maxLen, 480));
}
