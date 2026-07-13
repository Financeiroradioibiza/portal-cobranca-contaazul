export type DownloadProviderId = "spotizerr" | "deemix" | "youtube";

/** Motores exibidos no portal (Download link). Spotizerr fica só no worker/legado. */
/** Motores visíveis no Download link (YouTube fica no worker até implementação futura). */
export const PORTAL_DOWNLOAD_PROVIDERS = ["deemix"] as const satisfies readonly DownloadProviderId[];

export type PortalDownloadProviderId = (typeof PORTAL_DOWNLOAD_PROVIDERS)[number];

export const DOWNLOAD_PROVIDER_LABEL: Record<DownloadProviderId, string> = {
  spotizerr: "Spotizerr (Spotify)",
  deemix: "Deemix (Deezer)",
  youtube: "YouTube (yt-dlp)",
};

export const DOWNLOAD_PROVIDER_HINT: Record<DownloadProviderId, string> = {
  spotizerr:
    "Uma linha por faixa: link Spotify (track/album/playlist) ou «Artista - Música». Download no servidor via Spotizerr.",
  deemix:
    "Uma linha por faixa: «Artista - Música», link Deezer ou playlist Deezer. Várias versões no Deezer → escolha manual antes do download. Playlist Spotify: converta fora (Soundiiz/TuneMyMusic) e cole link Deezer ou TXT.",
  youtube:
    "Uma linha por faixa: link YouTube ou «Artista - Música». Download 100% no servidor (yt-dlp API).",
};

export type ParsedDownloadLine = {
  linhaOriginal: string;
  inputTipo: "url" | "texto";
};

export const SPOTIFY_URL_RE =
  /^https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\/[a-zA-Z0-9]+/i;

const SPOTIFY_RE = SPOTIFY_URL_RE;

export function isSpotifyUrl(input: string): boolean {
  return SPOTIFY_URL_RE.test(input.trim());
}
const DEEZER_RE =
  /^https?:\/\/(?:(?:www|link)\.)?deezer\.com\/(?:[a-z]{2}\/)?(?:track|album|playlist)\/\d+|^https?:\/\/link\.deezer\.com\/s\//i;
const YOUTUBE_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)[\w-]+/i;

function providerUrlRe(provider: DownloadProviderId): RegExp | null {
  switch (provider) {
    case "spotizerr":
      return SPOTIFY_RE;
    case "deemix":
      return DEEZER_RE;
    case "youtube":
      return YOUTUBE_RE;
    default:
      return null;
  }
}

/** Divide textarea em linhas úteis e classifica url vs texto livre. */
export function parseDownloadLines(raw: string, provider: DownloadProviderId): ParsedDownloadLine[] {
  const urlRe = providerUrlRe(provider);
  const out: ParsedDownloadLine[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const inputTipo = urlRe?.test(trimmed) ? "url" : "texto";
    out.push({ linhaOriginal: trimmed, inputTipo });
  }

  return out;
}

export function defaultJobTitulo(provider: DownloadProviderId, count: number): string {
  const label = DOWNLOAD_PROVIDER_LABEL[provider].split(" ")[0] ?? provider;
  return `${label} — ${count} faixa${count === 1 ? "" : "s"}`;
}
