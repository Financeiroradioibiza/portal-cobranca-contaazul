import { geminiEnabled, geminiGenerateJson } from "@/lib/criacao/geminiClient";

export type ExplicitTrackInput = {
  id: string;
  artista: string;
  titulo: string;
  /** Sinal da camada Deezer (explicit_lyrics), se já consultado. */
  deezerExplicit?: "sim" | "nao" | "desconhecida" | null;
  /** Sinal da camada MusicBrainz, se já consultado. */
  musicbrainzExplicit?: "sim" | "nao" | "desconhecida" | null;
};

export type GeminiExplicitResult = "sim" | "nao" | "desconhecida";

type GeminiRow = {
  id?: string;
  explicit?: boolean;
  conhecida?: boolean;
  motivo?: string;
};

function apiHintLabel(status: ExplicitTrackInput["deezerExplicit"]): string {
  if (status === "sim") return "sim";
  if (status === "nao") return "nao";
  if (status === "desconhecida") return "?";
  return "—";
}

/** Gemini pode devolver array, objeto único (1 faixa) ou envelope — normaliza. */
export function normalizeGeminiExplicitRows(parsed: unknown): GeminiRow[] {
  if (Array.isArray(parsed)) return parsed as GeminiRow[];
  if (!parsed || typeof parsed !== "object") return [];
  const o = parsed as Record<string, unknown>;
  for (const key of ["tracks", "items", "results", "faixas", "data"]) {
    const v = o[key];
    if (Array.isArray(v)) return v as GeminiRow[];
  }
  if ("id" in o || "explicit" in o || "conhecida" in o) return [o as GeminiRow];
  return [];
}

function matchGeminiRow(tracks: ExplicitTrackInput[], rows: GeminiRow[], track: ExplicitTrackInput, index: number): GeminiRow | undefined {
  const exact = rows.find((r) => r.id && String(r.id) === track.id);
  if (exact) return exact;
  const byIndex = rows[index];
  if (byIndex) return byIndex;
  const partial = rows.find((r) => {
    if (!r.id) return false;
    const rid = String(r.id);
    return rid === track.id || track.id.startsWith(rid) || rid.startsWith(track.id);
  });
  return partial;
}

function rowToGeminiResult(row: GeminiRow | undefined): GeminiExplicitResult {
  if (!row) return "desconhecida";
  if (row.conhecida === false) return "desconhecida";
  if (row.explicit === true) return "sim";
  return "nao";
}

/**
 * Classifica letras/conteúdo explícito via Gemini (conhecimento da faixa).
 */
export async function classifyExplicitLyricsWithGemini(
  tracks: ExplicitTrackInput[],
): Promise<Map<string, GeminiExplicitResult>> {
  const out = new Map<string, GeminiExplicitResult>();
  if (!geminiEnabled() || tracks.length === 0) return out;

  const lines = tracks
    .map(
      (t, i) =>
        `${i + 1}. id="${t.id}" | ${t.artista.trim() || "—"} — ${t.titulo.trim() || "(sem título)"} | Deezer explicit: ${apiHintLabel(t.deezerExplicit)} | MB explicit: ${apiHintLabel(t.musicbrainzExplicit)}`,
    )
    .join("\n");

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

  const parsed = await geminiGenerateJson<unknown>(prompt);
  const rows = normalizeGeminiExplicitRows(parsed);
  if (rows.length === 0) {
    for (const t of tracks) out.set(t.id, "desconhecida");
    return out;
  }

  for (let i = 0; i < tracks.length; i += 1) {
    const t = tracks[i]!;
    out.set(t.id, rowToGeminiResult(matchGeminiRow(tracks, rows, t, i)));
  }

  return out;
}

export function geminiExplicitToBoolean(result: GeminiExplicitResult | undefined): boolean | null {
  if (result === "sim") return true;
  if (result === "nao") return false;
  return null;
}
