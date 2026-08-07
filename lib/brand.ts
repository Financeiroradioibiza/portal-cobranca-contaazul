/** Nome da empresa exibido no portal. */
export const COMPANY_NAME = "Radio Ibiza";

/** URL pública do portal (assets de e-mail, links absolutos). */
export function portalPublicOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (raw && raw.length > 0 ? raw : "https://portal.radioibiza.app.br").replace(/\/$/, "");
}

/** Caminho absoluto para arquivo em /public (e-mails exigem URL https). */
export function portalPublicAsset(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${portalPublicOrigin()}${p}`;
}
