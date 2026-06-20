/** Extrai artista/título do nome do arquivo MP3. */
export function parseMp3Filename(name: string): { artista: string; titulo: string } {
  const base = name.replace(/\.mp3$/i, '').trim();
  const dash = base.indexOf(' - ');
  if (dash > 0) {
    return {
      artista: base.slice(0, dash).trim(),
      titulo: base.slice(dash + 3).trim(),
    };
  }
  return { artista: '', titulo: base || 'Faixa' };
}
