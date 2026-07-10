import { geminiEnabled, geminiGenerateJson, geminiTimeoutMs } from "@/lib/criacao/geminiClient";

export type ExplicitTrackInput = {
  id: string;
  artista: string;
  titulo: string;
  deezerExplicit?: "sim" | "nao" | "desconhecida" | null;
  musicbrainzExplicit?: "sim" | "nao" | "desconhecida" | null;
};

export type GeminiExplicitResult = "sim" | "nao" | "desconhecida";

export type GeminiClassifyOutcome = {
  result: GeminiExplicitResult;
  apiFailed?: boolean;
};

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
  if (tracks.length === 1 && rows.length === 1) return rows[0];
  return rows.find((r) => {
    if (!r.id) return false;
    const rid = String(r.id);
    return rid === track.id || track.id.startsWith(rid) || rid.startsWith(track.id);
  });
}

function rowToGeminiResult(row: GeminiRow | undefined): GeminiExplicitResult {
  if (!row) return "desconhecida";
  if (row.conhecida === false) return "desconhecida";
  if (row.explicit === true) return "sim";
  if (row.explicit === false) return "nao";
  return "desconhecida";
}

function buildPrompt(tracks: ExplicitTrackInput[]): string {
  const lines = tracks
    .map(
      (t, i) =>
        `${i + 1}. id="${t.id}" | ${t.artista.trim() || "—"} — ${t.titulo.trim() || "(sem título)"} | Deezer explicit: ${apiHintLabel(t.deezerExplicit)} | MB explicit: ${apiHintLabel(t.musicbrainzExplicit)}`,
    )
    .join("\n");

  return `Você modera música para rádio ambiente comercial no Brasil (lojas, shoppings).

Para CADA faixa, avalie a LETRA publicada. Marque explicit=true se houver palavrão forte, sexual explícito, drogas glorificadas ou violência gráfica.
Marque conhecida=true sempre que souber a faixa (mesmo título com artista conhecido no Brasil).
Só use conhecida=false se realmente não souber artista+título.

JSON — array com um objeto por faixa (mesmo se for só uma):
[{"id":"...","explicit":true|false,"conhecida":true|false,"motivo":"até 60 chars"}]

Faixas:
${lines}`;
}

/**
 * Classifica letras/conteúdo explícito via Gemini (conhecimento da faixa).
 */
export async function classifyExplicitLyricsWithGemini(
  tracks: ExplicitTrackInput[],
): Promise<Map<string, GeminiClassifyOutcome>> {
  const out = new Map<string, GeminiClassifyOutcome>();
  if (!geminiEnabled() || tracks.length === 0) return out;

  const prompt = buildPrompt(tracks);
  const { data: parsed, error } = await geminiGenerateJson<unknown>(prompt, {
    timeoutMs: tracks.length === 1 ? Math.max(geminiTimeoutMs(), 14_000) : geminiTimeoutMs(),
  });

  const rows = normalizeGeminiExplicitRows(parsed);
  if (rows.length === 0) {
    for (const t of tracks) {
      out.set(t.id, { result: "desconhecida", apiFailed: true });
    }
    if (error) console.warn("[explicitGemini] API failed:", error);
    return out;
  }

  for (let i = 0; i < tracks.length; i += 1) {
    const t = tracks[i]!;
    out.set(t.id, { result: rowToGeminiResult(matchGeminiRow(tracks, rows, t, i)) });
  }

  return out;
}

export function geminiExplicitToBoolean(result: GeminiExplicitResult | undefined): boolean | null {
  if (result === "sim") return true;
  if (result === "nao") return false;
  return null;
}
