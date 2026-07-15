/**
 * Ponto de mix legado no nome do MP3 (Servidor UP): «Artista - Faixa~3.mp3» → 3 segundos.
 * Upload comum e Download link não usam este sufixo na fila.
 */

const MIX_SUFFIX_RE = /~(\d{1,2})(?=\.mp3$)/i;
const MIX_TAIL_RE = /~(\d{1,2})$/i;

function clampMixSegundos(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n);
  if (v < 0 || v > 30) return null;
  return v;
}

/** Extrai ponto de mix (~N) do nome do arquivo, ex.: «Gilberto - Realce~2.mp3». */
export function parseMixSegundosFromLegacyFilename(filename: string): number | null {
  const base = (filename.replace(/\\/g, "/").split("/").pop() ?? filename).trim();
  const withoutExt = base.replace(/\.mp3$/i, "").trim();
  const m = withoutExt.match(MIX_TAIL_RE);
  if (!m) return null;
  return clampMixSegundos(Number(m[1]));
}

/** Anexa ~N antes de .mp3 (substitui sufixo existente). */
export function appendLegacyMixSuffixToMp3Nome(nome: string, mixSegundos: number): string {
  const mix = clampMixSegundos(mixSegundos);
  if (mix == null) return nome.trim().slice(0, 500);

  let base = nome.trim();
  if (!base.length) return base;
  if (!/\.mp3$/i.test(base)) base = `${base.replace(/\.mp3$/i, "")}.mp3`;
  base = base.replace(MIX_SUFFIX_RE, ".mp3");
  const stem = base.replace(/\.mp3$/i, "");
  return `${stem}~${mix}.mp3`.slice(0, 500);
}

export function mixSegundosFromRelativePath(relativePath: string): number | null {
  return parseMixSegundosFromLegacyFilename(relativePath);
}
