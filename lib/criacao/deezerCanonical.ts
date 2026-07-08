/**
 * URLs que o Deemix reconhece na prática (deezer-gui / deemix-js).
 * Não aceita link.deezer.com/s/… — só www.deezer.com/{track|album|playlist}/{id}
 */

const DEEZER_SHARE_RE = /^https?:\/\/link\.deezer\.com\//i;

export type DeezerLinkKind = "track" | "album" | "playlist";

export type CanonicalDeemixLink = {
  kind: DeezerLinkKind;
  id: string;
  url: string;
};

/** Extrai tipo + id e devolve URL limpa (sem locale / query), formato Deemix. */
export function toCanonicalDeemixUrl(input: string): CanonicalDeemixLink | null {
  const trimmed = input.trim().split("#")[0]?.split("?")[0]?.trim() ?? "";
  const m = trimmed.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/i);
  if (!m) return null;
  const kind = m[1]!.toLowerCase() as DeezerLinkKind;
  const id = m[2]!;
  return { kind, id, url: `https://www.deezer.com/${kind}/${id}` };
}

export function isDeezerShareUrl(input: string): boolean {
  return DEEZER_SHARE_RE.test(input.trim());
}

/** Segue redirect de link.deezer.com/s/… → URL completa do Deezer. */
export async function resolveDeezerShareUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!DEEZER_SHARE_RE.test(trimmed)) return trimmed;

  const res = await fetch(trimmed, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "text/html,application/json",
      "User-Agent": "RadioIbizaPortal/1.0 (download-link)",
    },
  });
  const finalUrl = res.url?.trim();
  const canonical = finalUrl ? toCanonicalDeemixUrl(finalUrl) : null;
  if (canonical) return canonical.url;

  throw new Error(
    "Link curto Deezer não resolveu — no Deemix use o link da barra do browser (www.deezer.com/playlist/… ou /track/…).",
  );
}

/** Normaliza qualquer entrada Deezer para URL que o Deemix aceita. */
export async function normalizeForDeemixInput(input: string): Promise<string> {
  const resolved = await resolveDeezerShareUrl(input);
  const canonical = toCanonicalDeemixUrl(resolved);
  if (canonical) return canonical.url;
  return resolved.trim();
}
