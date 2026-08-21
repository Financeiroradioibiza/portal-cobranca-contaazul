import { matchesSuporteSearch } from "@/lib/cadastros/producaoSuporteSearch";
import { isSuporteEspelhoEnabled } from "@/lib/cadastros/producaoSuporteEspelhoConfig";
import {
  buildProducaoSuporteEspelhoPayload,
  espelhoTelemetryIsStale,
  loadProducaoSuporteEspelho,
  rebuildProducaoSuporteEspelho,
  scheduleProducaoSuporteEspelhoTelemetryRefresh,
} from "@/lib/cadastros/producaoSuporteEspelhoService";
import type {
  ProducaoSuporteEspelhoStored,
  ProducaoSuportePayload,
  SuportePdvRow,
} from "@/lib/cadastros/producaoSuporteTypes";

export type { ProducaoSuportePayload, SuportePdvRow };

function isPlayerInstalado(row: SuportePdvRow): boolean {
  return Boolean(
    row.playerInstalacaoToken &&
      row.telemetry.firstPingAt &&
      row.statusPlayer === "Ativo",
  );
}

function isSemPrimeiroPing(row: SuportePdvRow): boolean {
  return row.portalPdvId != null && !row.telemetry.firstPingAt && row.statusPlayer === "Ativo";
}

function storedToPayload(
  stored: ProducaoSuporteEspelhoStored,
  canRegenerarToken: boolean,
  fonte: ProducaoSuportePayload["suporteFonte"],
  fonteErro?: string | null,
): ProducaoSuportePayload {
  return {
    layoutYearMonth: stored.layoutYearMonth,
    rioSourceYearMonth: stored.rioSourceYearMonth,
    overview: stored.overview,
    pdvs: stored.pdvs,
    clientes: stored.clientes,
    clientesCancelados: stored.clientesCancelados,
    espelhoBuiltAt: stored.espelhoBuiltAt,
    espelhoTelemetryAt: stored.espelhoTelemetryAt,
    suporteFonte: fonte,
    suporteFonteErro: fonteErro ?? null,
    canRegenerarToken,
  };
}

function filterPdvs(
  rows: SuportePdvRow[],
  options?: {
    searchQuery?: string;
    listFilter?: "sem_ping" | "instalados" | "sem_primeiro_ping";
    clienteKey?: string;
    limit?: number;
  },
): SuportePdvRow[] {
  let filtered = rows;
  const q = options?.searchQuery?.trim() ?? "";
  if (q) filtered = filtered.filter((row) => matchesSuporteSearch(row, q));
  if (options?.listFilter === "sem_ping") {
    filtered = filtered.filter((row) => row.semPing5Dias);
  } else if (options?.listFilter === "instalados") {
    filtered = filtered.filter(isPlayerInstalado);
  } else if (options?.listFilter === "sem_primeiro_ping") {
    filtered = filtered.filter(isSemPrimeiroPing);
  }
  if (options?.clienteKey) {
    filtered = filtered.filter((row) => row.clienteKey === options.clienteKey);
  }
  const limit = options?.limit ?? 5000;
  if (filtered.length > limit) filtered = filtered.slice(0, limit);
  return filtered;
}

function finalizePayload(
  base: ProducaoSuportePayload,
  options?: {
    searchQuery?: string;
    listFilter?: "sem_ping" | "instalados" | "sem_primeiro_ping";
    clienteKey?: string;
    limit?: number;
  },
): ProducaoSuportePayload {
  const allRows = base.pdvs;
  const filtered =
    options?.searchQuery || options?.listFilter || options?.clienteKey
      ? filterPdvs(allRows, options)
      : allRows;
  return { ...base, pdvs: filtered };
}

/** Cálculo ao vivo (cloud2 + cadastros) — fallback de emergência. */
export async function getProducaoSuporteLive(options?: {
  canRegenerarToken?: boolean;
  searchQuery?: string;
  listFilter?: "sem_ping" | "instalados" | "sem_primeiro_ping";
  clienteKey?: string;
  limit?: number;
  fonte?: "live" | "espelho_fallback";
  fonteErro?: string | null;
}): Promise<ProducaoSuportePayload> {
  const stored = await buildProducaoSuporteEspelhoPayload();
  const base = storedToPayload(
    stored,
    options?.canRegenerarToken ?? false,
    options?.fonte ?? "live",
    options?.fonteErro,
  );
  return finalizePayload(base, options);
}

async function getProducaoSuporteFromEspelho(options?: {
  canRegenerarToken?: boolean;
  searchQuery?: string;
  listFilter?: "sem_ping" | "instalados" | "sem_primeiro_ping";
  clienteKey?: string;
  limit?: number;
  forceRebuild?: boolean;
}): Promise<ProducaoSuportePayload> {
  let stored: ProducaoSuporteEspelhoStored;
  let telemetryAt: Date | null;

  if (options?.forceRebuild) {
    stored = await rebuildProducaoSuporteEspelho();
    telemetryAt = stored.espelhoTelemetryAt ? new Date(stored.espelhoTelemetryAt) : null;
  } else {
    const loaded = await loadProducaoSuporteEspelho();
    stored = loaded.payload;
    telemetryAt = loaded.telemetryAt;
    if (espelhoTelemetryIsStale(telemetryAt)) {
      scheduleProducaoSuporteEspelhoTelemetryRefresh();
    }
  }

  const base = storedToPayload(stored, options?.canRegenerarToken ?? false, "espelho");
  return finalizePayload(base, options);
}

export async function getProducaoSuporte(options?: {
  canRegenerarToken?: boolean;
  searchQuery?: string;
  listFilter?: "sem_ping" | "instalados" | "sem_primeiro_ping";
  clienteKey?: string;
  limit?: number;
  forceRebuild?: boolean;
  /** Ignora espelho — cálculo ao vivo (emergência / ?live=1). */
  forceLive?: boolean;
}): Promise<ProducaoSuportePayload> {
  const useEspelho = isSuporteEspelhoEnabled() && !options?.forceLive;

  if (!useEspelho) {
    return getProducaoSuporteLive({
      ...options,
      fonte: "live",
      fonteErro: options?.forceLive ? null : "SUPORTE_ESPELHO=0 no ambiente",
    });
  }

  try {
    return await getProducaoSuporteFromEspelho(options);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "espelho_indisponivel";
    console.error("[suporte] espelho falhou — fallback ao vivo", e);
    return getProducaoSuporteLive({
      ...options,
      fonte: "espelho_fallback",
      fonteErro: errMsg,
    });
  }
}

/** @deprecated Use getProducaoSuporte */
export async function getProducaoSuporteOverview(options?: {
  canRegenerarToken?: boolean;
}): Promise<ProducaoSuportePayload> {
  return getProducaoSuporte({ canRegenerarToken: options?.canRegenerarToken });
}
