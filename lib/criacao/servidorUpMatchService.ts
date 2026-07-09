import {
  resolveDeezerTrackFromText,
  type DeezerTrackCandidate,
  type DeezerTrackResolveResult,
} from "@/lib/criacao/deezerTrackMatch";

const DZ_BASE = "https://api.deezer.com";
const DZ_UA = "RadioIbizaPortal/1.0 (servidor-up; contact@radioibiza.com.br)";

export type ServidorUpInventoryTrack = {
  relativePath: string;
  fileName: string;
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
  artista: string;
  titulo: string;
  durationSec: number | null;
  bitrateKbps?: number | null;
  sizeBytes?: number;
};

export type ServidorUpMatchVerdict = "auto" | "review" | "pick" | "not_found" | "rejected";

export type ServidorUpMatchCandidate = DeezerTrackCandidate & {
  durationSec: number | null;
  durationDiffSec: number | null;
};

export type ServidorUpMatchRow = {
  relativePath: string;
  fileName: string;
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
  artista: string;
  titulo: string;
  legacyDurationSec: number | null;
  searchLine: string;
  verdict: ServidorUpMatchVerdict;
  verdictReason: string;
  selected: ServidorUpMatchCandidate | null;
  candidates: ServidorUpMatchCandidate[];
  deezerUrl: string | null;
};

export type ServidorUpMatchBatchResult = {
  ok: true;
  rows: ServidorUpMatchRow[];
  stats: {
    total: number;
    auto: number;
    review: number;
    pick: number;
    notFound: number;
    rejected: number;
  };
};

const durationCache = new Map<number, number | null>();

async function fetchDeezerTrackDuration(trackId: number): Promise<number | null> {
  const cached = durationCache.get(trackId);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`${DZ_BASE}/track/${trackId}`, {
      headers: { Accept: "application/json", "User-Agent": DZ_UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      durationCache.set(trackId, null);
      return null;
    }
    const data = (await res.json()) as { duration?: number };
    const sec = typeof data.duration === "number" ? data.duration : null;
    durationCache.set(trackId, sec);
    return sec;
  } catch {
    durationCache.set(trackId, null);
    return null;
  }
}

async function enrichCandidates(
  candidates: DeezerTrackCandidate[],
  legacyDurationSec: number | null,
): Promise<ServidorUpMatchCandidate[]> {
  const out: ServidorUpMatchCandidate[] = [];
  for (const c of candidates) {
    const durationSec = await fetchDeezerTrackDuration(c.trackId);
    const durationDiffSec =
      legacyDurationSec != null && durationSec != null ?
        Math.abs(durationSec - legacyDurationSec)
      : null;
    out.push({ ...c, durationSec, durationDiffSec });
  }
  return out;
}

function buildSearchLine(track: ServidorUpInventoryTrack): string {
  const a = track.artista.trim();
  const t = track.titulo.trim();
  if (a && t) return `${a} - ${t}`;
  const stem = track.fileName.replace(/\.mp3$/i, "").trim();
  return stem || t || a || track.fileName;
}

function pickByLegacyDuration(
  enriched: ServidorUpMatchCandidate[],
  legacyDurationSec: number | null,
): { selected: ServidorUpMatchCandidate | null; verdict: ServidorUpMatchVerdict; reason: string } {
  if (enriched.length === 0) {
    return { selected: null, verdict: "not_found", reason: "Nenhum candidato Deezer." };
  }

  if (legacyDurationSec == null) {
    const top = enriched[0]!;
    if (enriched.length === 1 && top.score >= 92) {
      return { selected: top, verdict: "auto", reason: "Match alto (sem duração legado)." };
    }
    return {
      selected: top,
      verdict: enriched.length > 1 ? "pick" : "review",
      reason: "Sem duração legado — confirme manualmente.",
    };
  }

  const sorted = [...enriched].sort((a, b) => {
    const da = a.durationDiffSec ?? 9999;
    const db = b.durationDiffSec ?? 9999;
    if (da !== db) return da - db;
    return b.score - a.score;
  });

  const best = sorted[0]!;
  const diff = best.durationDiffSec;

  if (diff == null) {
    return {
      selected: best,
      verdict: sorted.length > 1 ? "pick" : "review",
      reason: "Duração Deezer indisponível.",
    };
  }

  if (diff <= 3) {
    return {
      selected: best,
      verdict: "auto",
      reason: `Duração OK (Δ ${diff.toFixed(0)}s).`,
    };
  }

  if (diff <= 10) {
    const closeAlt = sorted.find((c) => c.durationDiffSec != null && c.durationDiffSec <= 3);
    if (closeAlt) {
      return {
        selected: closeAlt,
        verdict: "auto",
        reason: `Versão alternativa com Δ ${closeAlt.durationDiffSec!.toFixed(0)}s.`,
      };
    }
    return {
      selected: best,
      verdict: "review",
      reason: `Duração diverge ${diff.toFixed(0)}s — revisar versão.`,
    };
  }

  const closeAlt = sorted.find((c) => c.durationDiffSec != null && c.durationDiffSec <= 10);
  if (closeAlt) {
    return {
      selected: closeAlt,
      verdict: "review",
      reason: `Melhor candidato por duração (Δ ${closeAlt.durationDiffSec!.toFixed(0)}s).`,
    };
  }

  return {
    selected: best,
    verdict: "rejected",
    reason: `Provável outra versão (Δ ${diff.toFixed(0)}s). Escolha manual ou pule.`,
  };
}

async function matchOneTrack(track: ServidorUpInventoryTrack): Promise<ServidorUpMatchRow> {
  const searchLine = buildSearchLine(track);
  const base = {
    relativePath: track.relativePath,
    fileName: track.fileName,
    clienteNome: track.clienteNome,
    programacaoNome: track.programacaoNome,
    pastaNome: track.pastaNome,
    artista: track.artista,
    titulo: track.titulo,
    legacyDurationSec: track.durationSec,
    searchLine,
  };

  let resolveResult: DeezerTrackResolveResult;
  try {
    resolveResult = await resolveDeezerTrackFromText(searchLine);
  } catch (e) {
    return {
      ...base,
      verdict: "not_found",
      verdictReason: e instanceof Error ? e.message : "Erro na busca Deezer.",
      selected: null,
      candidates: [],
      deezerUrl: null,
    };
  }

  const candidatesRaw =
    resolveResult.status === "resolved" ?
      [resolveResult.candidate]
    : resolveResult.candidates;

  const enriched = await enrichCandidates(candidatesRaw, track.durationSec);

  if (resolveResult.status === "pick" && enriched.length > 0) {
    const { selected, verdict, reason } = pickByLegacyDuration(enriched, track.durationSec);
    const finalVerdict: ServidorUpMatchVerdict = verdict === "auto" ? "auto" : "pick";
    return {
      ...base,
      verdict: finalVerdict,
      verdictReason: reason,
      selected,
      candidates: enriched,
      deezerUrl: selected?.url ?? null,
    };
  }

  if (resolveResult.status === "not_found") {
    return {
      ...base,
      verdict: "not_found",
      verdictReason: "Não encontrado no Deezer.",
      selected: null,
      candidates: enriched,
      deezerUrl: null,
    };
  }

  const { selected, verdict, reason } = pickByLegacyDuration(enriched, track.durationSec);
  const finalVerdict: ServidorUpMatchVerdict =
    resolveResult.status === "resolved" && verdict === "pick" ? "review" : verdict;

  return {
    ...base,
    verdict: finalVerdict,
    verdictReason: reason,
    selected,
    candidates: enriched,
    deezerUrl: selected?.url ?? (resolveResult.status === "resolved" ? resolveResult.url : null),
  };
}

/** Match em lote com conferência legado × Deezer por duração. */
export async function matchServidorUpInventory(
  tracks: ServidorUpInventoryTrack[],
  opts?: { concurrency?: number },
): Promise<ServidorUpMatchBatchResult> {
  const concurrency = Math.min(6, Math.max(1, opts?.concurrency ?? 3));
  const rows: ServidorUpMatchRow[] = new Array(tracks.length);

  let idx = 0;
  async function worker() {
    while (idx < tracks.length) {
      const i = idx++;
      const track = tracks[i];
      if (!track) continue;
      rows[i] = await matchOneTrack(track);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const filled = rows.filter(Boolean);
  return {
    ok: true,
    rows: filled,
    stats: {
      total: filled.length,
      auto: filled.filter((r) => r.verdict === "auto").length,
      review: filled.filter((r) => r.verdict === "review").length,
      pick: filled.filter((r) => r.verdict === "pick").length,
      notFound: filled.filter((r) => r.verdict === "not_found").length,
      rejected: filled.filter((r) => r.verdict === "rejected").length,
    },
  };
}
