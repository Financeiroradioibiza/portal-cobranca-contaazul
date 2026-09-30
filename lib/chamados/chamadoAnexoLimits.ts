/** Limite por arquivo (bytes) — alinhado a comprovantes / anexos leves no portal. */
export const CHAMADO_ANEXO_MAX_BYTES = 10 * 1024 * 1024;

export const CHAMADO_ANEXO_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
] as const;

export function isAllowedChamadoAnexoMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (CHAMADO_ANEXO_MIME_PREFIXES.some((p) => m.startsWith(p) || m === p)) return true;
  if (m === "application/octet-stream") return true;
  return false;
}
