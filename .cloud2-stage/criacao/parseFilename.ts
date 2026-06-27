/** Remove sujeira comum de nomes de arquivo (vídeo, by…, colchetes). */
function cleanFilenamePart(s: string): string {
  return s
    .replace(/\([^)]*(?:video|official|audio|lyric|visualizer|mv|hd|4k|live|music\s*video|by\s*[\w.]+)[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extrai artista/título do nome do arquivo MP3. */
export function parseMp3Filename(name: string): { artista: string; titulo: string } {
  const base = name.replace(/\.mp3$/i, "").trim();
  const dash = base.indexOf(" - ");
  if (dash > 0) {
    return {
      artista: cleanFilenamePart(base.slice(0, dash)),
      titulo: cleanFilenamePart(base.slice(dash + 3)),
    };
  }
  return { artista: "", titulo: cleanFilenamePart(base) || "Faixa" };
}
