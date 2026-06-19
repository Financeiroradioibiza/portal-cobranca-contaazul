import { geminiEnabled, geminiGenerateJson } from "@/lib/criacao/geminiClient";

export type ExplicitTrackInput = {
  id: string;
  artista: string;
  titulo: string;
};

export type GeminiExplicitResult = "sim" | "nao" | "desconhecida";

type GeminiRow = {
  id?: string;
  explicit?: boolean;
  conhecida?: boolean;
  motivo?: string;
};

/**
 * Classifica letras/conteúdo explícito via Gemini (conhecimento da faixa).
 * Lote grande — ex.: 25–40 faixas por chamada (como lista de 300 no chat).
 */
export async function classifyExplicitLyricsWithGemini(
  tracks: ExplicitTrackInput[],
): Promise<Map<string, GeminiExplicitResult>> {
  const out = new Map<string, GeminiExplicitResult>();
  if (!geminiEnabled() || tracks.length === 0) return out;

  const lines = tracks
    .map(
      (t, i) =>
        `${i + 1}. id="${t.id}" | ${t.artista.trim() || "—"} — ${t.titulo.trim() || "(sem título)"}`,
    )
    .join("\n");

  const prompt = `Você modera música para rádio ambiente comercial no Brasil (lojas, shoppings).

Para CADA faixa abaixo, use seu conhecimento da LETRA publicada e do conteúdo da música.
Marque explicit=true se a letra tiver palavrão forte, sexual explícito, drogas glorificadas ou violência gráfica.
Não marque só pelo gênero ou reputação do artista.
Se você NÃO conhece a faixa com segurança, use explicit=false e conhecida=false.

Responda SOMENTE JSON (array):
[{"id":"...","explicit":true|false,"conhecida":true|false,"motivo":"até 60 chars"}]

Faixas:
${lines}`;

  const parsed = await geminiGenerateJson<GeminiRow[]>(prompt);
  if (!parsed || !Array.isArray(parsed)) {
    for (const t of tracks) out.set(t.id, "desconhecida");
    return out;
  }

  const byId = new Map(parsed.filter((r) => r.id).map((r) => [String(r.id), r]));

  for (const t of tracks) {
    const row = byId.get(t.id);
    if (!row) {
      out.set(t.id, "desconhecida");
      continue;
    }
    if (row.conhecida === false) {
      out.set(t.id, "desconhecida");
    } else if (row.explicit === true) {
      out.set(t.id, "sim");
    } else {
      out.set(t.id, "nao");
    }
  }

  return out;
}

export function geminiExplicitToBoolean(result: GeminiExplicitResult | undefined): boolean | null {
  if (result === "sim") return true;
  if (result === "nao") return false;
  return null;
}
