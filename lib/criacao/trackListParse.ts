export type ResolvedTrack = {
  title: string;
  artist: string;
  source: "spotify" | "txt" | "manual";
  sourceRef?: string;
  suggestedFilename: string;
};

function safeFilename(title: string, artist: string): string {
  const base = `${artist} - ${title}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").trim();
  const clipped = base.slice(0, 180) || "faixa";
  return `${clipped}.mp3`;
}

/** Uma faixa por linha: "Artista - Título", "Título - Artista" ou só título. */
export function parseTrackListText(raw: string): ResolvedTrack[] {
  const lines = raw.split(/\r?\n/);
  const out: ResolvedTrack[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let title = trimmed;
    let artist = "";

    const dash = trimmed.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (dash) {
      const a = dash[1]!.trim();
      const b = dash[2]!.trim();
      if (a.length >= b.length) {
        artist = a;
        title = b;
      } else {
        artist = b;
        title = a;
      }
    }

    const key = `${artist}|${title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      artist,
      source: "txt",
      suggestedFilename: safeFilename(title, artist),
    });
  }

  return out;
}

export { safeFilename };
