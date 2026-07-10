import { geminiEnabled, geminiGenerateJson } from './geminiClient.js';

function apiHintLabel(status) {
  if (status === 'sim') return 'sim';
  if (status === 'nao') return 'nao';
  if (status === 'desconhecida') return '?';
  return '—';
}

export function normalizeGeminiExplicitRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['tracks', 'items', 'results', 'faixas', 'data']) {
    const v = parsed[key];
    if (Array.isArray(v)) return v;
  }
  if ('id' in parsed || 'explicit' in parsed || 'conhecida' in parsed) return [parsed];
  return [];
}

function matchGeminiRow(tracks, rows, track, index) {
  const exact = rows.find((r) => r.id && String(r.id) === track.id);
  if (exact) return exact;
  const byIndex = rows[index];
  if (byIndex) return byIndex;
  return rows.find((r) => {
    if (!r.id) return false;
    const rid = String(r.id);
    return rid === track.id || track.id.startsWith(rid) || rid.startsWith(track.id);
  });
}

function rowToGeminiResult(row) {
  if (!row) return 'desconhecida';
  if (row.conhecida === false) return 'desconhecida';
  if (row.explicit === true) return 'sim';
  return 'nao';
}

/**
 * Classifica letras/conteúdo explícito via Gemini (conhecimento da faixa).
 */
export async function classifyExplicitLyricsWithGemini(tracks) {
  const out = new Map();
  if (!geminiEnabled() || tracks.length === 0) return out;

  const lines = tracks
    .map(
      (t, i) =>
        `${i + 1}. id="${t.id}" | ${(t.artista || '—').trim()} — ${(t.titulo || '(sem título)').trim()} | Deezer explicit: ${apiHintLabel(t.deezerExplicit)} | MB explicit: ${apiHintLabel(t.musicbrainzExplicit)}`,
    )
    .join('\n');

  const prompt = `Você modera música para rádio ambiente comercial no Brasil (lojas, shoppings).

Para CADA faixa abaixo, use seu conhecimento da LETRA publicada e do conteúdo da música.
Marque explicit=true se a letra tiver palavrão forte, sexual explícito, drogas glorificadas ou violência gráfica.
Não marque só pelo gênero ou reputação do artista.
Se Deezer ou MusicBrainz já indicam explicit=sim, confirme com a letra; se a letra for explícita, marque explicit=true e conhecida=true.
Se você NÃO conhece a faixa com segurança, use explicit=false e conhecida=false.

Responda SOMENTE JSON — array com um objeto por faixa (mesmo se for só uma):
[{"id":"...","explicit":true|false,"conhecida":true|false,"motivo":"até 60 chars"}]

Faixas:
${lines}`;

  const parsed = await geminiGenerateJson(prompt);
  const rows = normalizeGeminiExplicitRows(parsed);
  if (rows.length === 0) {
    for (const t of tracks) out.set(t.id, 'desconhecida');
    return out;
  }

  for (let i = 0; i < tracks.length; i += 1) {
    const t = tracks[i];
    out.set(t.id, rowToGeminiResult(matchGeminiRow(tracks, rows, t, i)));
  }

  return out;
}
