import {
  isAlternateVersionTitle,
  normalizeLegacyFilenameForSearch,
  resolveDeezerLegacyCandidates,
  type DeezerTrackCandidate,
} from "@/lib/criacao/deezerTrackMatch";

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

export type ServidorUpMatchVerdict = "auto" | "review" | "pick" | "not_found" | "rejected" | "skipped";

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
  normalizedSearchLine: string;
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

const DZ_BASE = "https://api.deezer.com";
const DZ_UA = "RadioIbizaPortal/1.0 (servidor-up; contact@radioibiza.com.br)";
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
    let durationSec = c.durationSec ?? null;
    if (durationSec == null) {
      durationSec = await fetchDeezerTrackDuration(c.trackId);
    }
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

function legacyWantsAlternateVersion(legacyTitle: string): boolean {
  return isAlternateVersionTitle(legacyTitle);
}

function versionSortPenalty(legacyTitle: string, candidateTitle: string): number {
  if (legacyWantsAlternateVersion(legacyTitle)) return 0;
  return isAlternateVersionTitle(candidateTitle) ? 1 : 0;
}

function pickByLegacyDuration(
  enriched: ServidorUpMatchCandidate[],
  legacyDurationSec: number | null,
  legacyTitle: string,
): { selected: ServidorUpMatchCandidate | null; verdict: ServidorUpMatchVerdict; reason: string } {
  if (enriched.length === 0) {
    return { selected: null, verdict: "not_found", reason: "Nenhum candidato Deezer." };
  }

  const sorted = [...enriched].sort((a, b) => {
    const da = a.durationDiffSec ?? 9999;
    const db = b.durationDiffSec ?? 9999;
    if (Math.abs(da - db) > 2) return da - db;

    const altA = versionSortPenalty(legacyTitle, a.title);
    const altB = versionSortPenalty(legacyTitle, b.title);
    if (altA !== altB) return altA - altB;

    return b.score - a.score;
  });

  if (legacyDurationSec == null) {
    const top = sorted[0]!;
    if (sorted.length === 1 && top.score >= 88) {
      return { selected: top, verdict: "auto", reason: "Match alto (sem duração legado)." };
    }
    return {
      selected: top,
      verdict: sorted.length > 1 ? "pick" : "review",
      reason: "Sem duração legado — confirme manualmente.",
    };
  }

  const best = sorted[0]!;
  const diff = best.durationDiffSec;

  if (diff == null) {
    return {
      selected: best,
      verdict: sorted.length > 1 ? "pick" : "review",
      reason: "Duração Deezer indisponível — escolha a versão correta na lista.",
    };
  }

  if (diff <= 3) {
    const plainStudio = sorted.find(
      (c) =>
        (c.durationDiffSec ?? 999) <= 3 &&
        versionSortPenalty(legacyTitle, c.title) === 0,
    );
    const chosen = plainStudio ?? best;
    return {
      selected: chosen,
      verdict: "auto",
      reason: `Duração OK (Δ ${(chosen.durationDiffSec ?? diff).toFixed(0)}s).`,
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
      reason: `Duração diverge ${diff.toFixed(0)}s — ouça legado × Deezer e confirme.`,
    };
  }

  const closeAlt = sorted.find((c) => c.durationDiffSec != null && c.durationDiffSec <= 10);
  if (closeAlt) {
    return {
      selected: closeAlt,
      verdict: "review",
      reason: `Melhor candidato por duração (Δ ${closeAlt.durationDiffSec!.toFixed(0)}s) — confirme.`,
    };
  }

  return {
    selected: best,
    verdict: "pick",
    reason: `Versões diferentes (Δ ${diff.toFixed(0)}s) — escolha a que bate com ${formatMmSs(legacyDurationSec)}.`,
  };
}

function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function matchOneTrack(track: ServidorUpInventoryTrack): Promise<ServidorUpMatchRow> {
  const searchLine = buildSearchLine(track);
  const normalizedSearchLine = normalizeLegacyFilenameForSearch(searchLine);
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
    normalizedSearchLine,
  };

  let candidatesRaw: DeezerTrackCandidate[] = [];
  try {
    const resolved = await resolveDeezerLegacyCandidates(normalizedSearchLine);
    candidatesRaw = resolved.candidates;
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

  if (candidatesRaw.length === 0) {
    return {
      ...base,
      verdict: "not_found",
      verdictReason:
        "Não encontrado no Deezer — tente colar link deezer.com/track/… ou busque no Deemix e escolha manual.",
      selected: null,
      candidates: [],
      deezerUrl: null,
    };
  }

  const enriched = await enrichCandidates(candidatesRaw, track.durationSec);
  const { selected, verdict, reason } = pickByLegacyDuration(
    enriched,
    track.durationSec,
    track.titulo,
  );

  let finalVerdict = verdict;
  if (verdict === "pick" && enriched.length === 1) {
    finalVerdict = "review";
  }

  return {
    ...base,
    verdict: finalVerdict,
    verdictReason: reason,
    selected,
    candidates: enriched,
    deezerUrl: selected?.url ?? null,
  };
}

/** Match em lote com conferência legado × Deezer por duração. */
export async function matchServidorUpInventory(
  tracks: ServidorUpInventoryTrack[],
  opts?: { concurrency?: number },
): Promise<ServidorUpMatchBatchResult> {
  const concurrency = Math.min(4, Math.max(1, opts?.concurrency ?? 2));
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
