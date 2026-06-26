export type DownloadProviderId = "spotizerr" | "deemix" | "youtube";

export const DOWNLOAD_PROVIDER_LABEL: Record<DownloadProviderId, string> = {
  spotizerr: "Spotizerr (Spotify)",
  deemix: "Deemix (Deezer)",
  youtube: "YouTube (yt-dlp)",
};

export const DOWNLOAD_PROVIDER_HINT: Record<DownloadProviderId, string> = {
  spotizerr:
    "Uma linha por faixa: link Spotify (track/album/playlist) ou «Artista - Música». Download no servidor via Spotizerr.",
  deemix:
    "Uma linha por faixa: link Deezer ou «Artista - Música». Requer Deemix no cloud2 (perfil admin).",
  youtube:
    "Uma linha por faixa: link YouTube ou «Artista - Música». Download 100% no servidor (yt-dlp API).",
};

export type ParsedDownloadLine = {
  linhaOriginal: string;
  inputTipo: "url" | "texto";
};

const SPOTIFY_RE =
  /^https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\/[a-zA-Z0-9]+/i;
const DEEZER_RE = /^https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/\d+/i;
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
