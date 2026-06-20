import { geminiEnabled, geminiGenerateJson } from './geminiClient.js';

/**
 * Classifica letras/conteúdo explícito via Gemini (conhecimento da faixa).
 */
export async function classifyExplicitLyricsWithGemini(tracks) {
  const out = new Map();
  if (!geminiEnabled() || tracks.length === 0) return out;

  const lines = tracks
    .map(
      (t, i) =>
        `${i + 1}. id="${t.id}" | ${(t.artista || '—').trim()} — ${(t.titulo || '(sem título)').trim()}`,
    )
    .join('\n');

  const prompt = `Você modera música para rádio ambiente comercial no Brasil (lojas, shoppings).

Para CADA faixa abaixo, use seu conhecimento da LETRA publicada e do conteúdo da música.
Marque explicit=true se a letra tiver palavrão forte, sexual explícito, drogas glorificadas ou violência gráfica.
Não marque só pelo gênero ou reputação do artista.
Se você NÃO conhece a faixa com segurança, use explicit=false e conhecida=false.

Responda SOMENTE JSON (array):
[{"id":"...","explicit":true|false,"conhecida":true|false,"motivo":"até 60 chars"}]

Faixas:
${lines}`;

  const parsed = await geminiGenerateJson(prompt);
  if (!parsed || !Array.isArray(parsed)) {
    for (const t of tracks) out.set(t.id, 'desconhecida');
    return out;
  }

  const byId = new Map(parsed.filter((r) => r.id).map((r) => [String(r.id), r]));

  for (const t of tracks) {
    const row = byId.get(t.id);
    if (!row) {
      out.set(t.id, 'desconhecida');
      continue;
    }
    if (row.conhecida === false) out.set(t.id, 'desconhecida');
    else if (row.explicit === true) out.set(t.id, 'sim');
    else out.set(t.id, 'nao');
  }

  return out;
}
