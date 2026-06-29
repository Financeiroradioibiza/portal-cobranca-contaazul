"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RIO_CA_REFRESH_BATCH_SIZE,
  RIO_CA_REFRESH_BATCH_SIZE_WITH_CONTRACTS,
  rioCaRefreshBatchLimit,
} from "@/lib/rio/rioCaPersonLink";
import { COBRANCA_HOME_HREF } from "@/lib/portal/cobrancaNav";
import { COMPANY_NAME } from "@/lib/brand";
import {
  ClienteMarcaBlock,
  type RioGrupoCb,
  type RioLinhaCb,
} from "@/components/rio/ClienteMarcaBlock";
import { PdvMovimentoMarcaBlock } from "@/components/rio/PdvMovimentoMarcaBlock";
import { isRioTurnoverMonth } from "@/lib/rio/rioTurnover";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/manualReminders/yearMonth";
import { donorYearMonthFor } from "@/lib/rio/rioTurnover";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { RIO_CLONE_DONOR_BATCH_SIZE } from "@/lib/rio/cloneRioCompMonthBatched";
import { RIO_VIRADA_LINHAS_BATCH } from "@/lib/rio/rioViradaBatched";
import { sortRioPdvsByNome, type ParsedPdvRow } from "@/lib/rio/pdvNames";
import { formatRioValorTotal, sumRioLinhasTotals } from "@/lib/rio/rioPlanilhaTotals";
import {
  compareRioLinhasByNomeFantasia,
  sortRioCompGruposForDisplay,
} from "@/lib/rio/sortRioCompLinhas";
import { displayBrazilianTaxId } from "@/lib/format";
import { downloadRioMonthStyledExcel } from "@/lib/rio/rioPlanilhaExport";
import { PortalNoticeBanner } from "@/components/portal/PortalNoticeBanner";
import {
  buildHttpErrorReport,
  extractServerDebug,
  type PortalNotice,
} from "@/lib/portal/errorDebugReport";
import { readJsonFromResponse } from "@/lib/safeHttpJson";
import { arrayMove } from "@dnd-kit/sortable";

type MonthMeta = { id: string; yearMonth: number; closedAt?: string | null };

type RioGrupo = RioGrupoCb;
type RioLinha = RioLinhaCb;
type RioPdv = RioLinha["pdvs"][number];

function bucketize(grupOrd: RioGrupo[], linhasAll: RioLinha[]) {
  const map = new Map<string, RioLinha[]>();
  for (const g of grupOrd) map.set(g.id, []);
  const orphans: RioLinha[] = [];

  for (const ln of linhasAll) {
    const gid = ln.rioGrupoId;
    if (gid && map.has(gid)) map.get(gid)!.push(ln);
    else orphans.push(ln);
  }

  map.forEach((arr) => arr.sort(compareRioLinhasByNomeFantasia));
  orphans.sort(compareRioLinhasByNomeFantasia);
  return { map, orphans } as const;
}

function stripLineFromBuckets(
  map: Map<string, RioLinha[]>,
  orphansList: RioLinha[],
  lineId: string,
): { map: Map<string, RioLinha[]>; orphans: RioLinha[] } {
  const m2 = new Map<string, RioLinha[]>();
  map.forEach((arr, k) => {
    m2.set(
      k,
      arr.filter((x) => x.id !== lineId),
    );
  });
  return { map: m2, orphans: orphansList.filter((x) => x.id !== lineId) };
}

export function RioClientesCompPanel() {
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState<number>(todayYm);
  const [monthInfo, setMonthInfo] = useState<{
    lastSyncedAt: string | null;
    closedAt: string | null;
  } | null>(null);
  const [linhas, setLinhas] = useState<RioLinha[]>([]);
  const [grupos, setGrupos] = useState<RioGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [revertingSync, setRevertingSync] = useState(false);
  const [notice, setNotice] = useState<PortalNotice | null>(null);
  const setMsg = useCallback((message: string | null) => {
    setNotice(message ? { message } : null);
  }, []);
  const setHttpError = useCallback(
    (input: {
      action: string;
      method: string;
      url: string;
      userMessage: string;
      ok: boolean;
      status: number;
      parseError?: boolean;
      rawText?: string;
      data?: unknown;
      requestBody?: unknown;
      context?: Record<string, unknown>;
    }) => {
      setNotice({
        message: input.userMessage,
        severity: "error",
        debug: buildHttpErrorReport({
          ...input,
          server: extractServerDebug(input.data),
          pageHref: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
    },
    [],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [newPdvName, setNewPdvName] = useState<Record<string, string>>({});
  /** Buscar contrato na CA por cliente deixa o pedido muito longo (timeout no Netlify/proxy). */
  const [syncIncludeContracts, setSyncIncludeContracts] = useState(false);
  /** Muitas chamadas GET /v1/pessoas?ids… (e-mail cobrança, razão, valor) — típico gatilho de timeout sem contratos. */
  const [syncIncludePersonDetails, setSyncIncludePersonDetails] = useState(false);
  const fileImportRef = useRef<HTMLInputElement | null>(null);
  const fileMarcaLayoutRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  /** Import CSV: cruzar com mês anterior → entrada/saída como no sync pela API */
  const [importInferMovement, setImportInferMovement] = useState(true);
  const [caServerConnected, setCaServerConnected] = useState<boolean | null>(null);
  const [linkModalLinha, setLinkModalLinha] = useState<RioLinha | null>(null);
  const [buscaCa, setBuscaCa] = useState("");
  const [hitsCa, setHitsCa] = useState<{ id: string; nome: string; documento?: string | null }[]>([]);
  const [linkModalNotice, setLinkModalNotice] = useState<string | null>(null);
  const [linkHitFeedback, setLinkHitFeedback] = useState<
    Record<string, { status: "busy" | "ok" | "error"; message: string }>
  >({});
  const [caLinkBusy, setCaLinkBusy] = useState(false);
  const [clashNavLinhaId, setClashNavLinhaId] = useState<string | null>(null);
  const [refreshingCa, setRefreshingCa] = useState(false);
  const [exportingMonth, setExportingMonth] = useState(false);
  /** Painel de configuração (textos, sync, import) — oculto por padrão para mostrar a planilha. */
  const [rioConfigOpen, setRioConfigOpen] = useState(false);

  const loadMonths = useCallback(async () => {
    const res = await fetch("/api/rio-planilha/clientes/months", { credentials: "include" });
    const { data } = await readJsonFromResponse<{ months?: MonthMeta[] }>(res);
    if (res.ok && data?.months) setMonths(data.months);
  }, []);

  const loadMonth = useCallback(async (ym: number) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rio-planilha/clientes/month/${ym}`, {
        credentials: "include",
      });
      const { data, rawText } = await readJsonFromResponse<{
        month?: { lastSyncedAt?: string | null; closedAt?: string | null } | null;
        grupos?: RioGrupo[];
        linhas?: RioLinha[];
      }>(res);
      if (!res.ok) {
        setMsg(data && "error" in data ? String((data as { error: string }).error) : rawText.slice(0, 200));
        setLinhas([]);
        setGrupos([]);
        setMonthInfo(null);
        return;
      }
      setMonthInfo(
        data?.month ?
          {
            lastSyncedAt: data.month.lastSyncedAt ?? null,
            closedAt: data.month.closedAt ?? null,
          }
        : { lastSyncedAt: null, closedAt: null },
      );
      setGrupos(Array.isArray(data?.grupos) ? data!.grupos! : []);
      setLinhas(Array.isArray(data?.linhas) ? data!.linhas! : []);
    } catch {
      setMsg("Falha ao carregar competência.");
      setLinhas([]);
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonths();
  }, [loadMonths]);

  useEffect(() => {
    if (months.length === 0) return;
    setActiveYm(pickVigenteRioYearMonth(months, todayYm));
  }, [months, todayYm]);

  useEffect(() => {
    void loadMonth(activeYm);
  }, [activeYm, loadMonth]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const res = await fetch("/api/contaazul/status", { credentials: "include" });
      const { data, parseError } = await readJsonFromResponse<{ connected?: boolean }>(res);
      if (canceled || parseError || !data) return;
      if (typeof data.connected === "boolean") setCaServerConnected(data.connected);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!linkModalLinha) {
      setHitsCa([]);
      setLinkModalNotice(null);
      setLinkHitFeedback({});
      return;
    }
    const t = setTimeout(async () => {
      const q = buscaCa.trim();
      if (q.length < 2) {
        setHitsCa([]);
        return;
      }
      const res = await fetch(
        `/api/manual-envios/contaazul/pessoas?q=${encodeURIComponent(q)}`,
        { credentials: "include" },
      );
      const { data } = await readJsonFromResponse<{
        connected?: boolean | null;
        message?: string;
        caError?: string;
        pessoas?: { id: string; nome: string; documento?: string | null }[];
      }>(res);
      setHitsCa(data?.pessoas ?? []);
      if (data?.connected === false && data.message) setLinkModalNotice(data.message);
      else if (data?.caError) setLinkModalNotice(`Falha na API: ${data.caError}`);
      else setLinkModalNotice(null);
    }, 380);
    return () => clearTimeout(t);
  }, [buscaCa, linkModalLinha]);

  const ensureMonthShell = useCallback(async () => {
    const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}`, {
      method: "PUT",
      credentials: "include",
    });
    if (!res.ok) {
      const { data } = await readJsonFromResponse<{ error?: string }>(res);
      setMsg(data?.error || "Não foi possível criar o mês.");
      return;
    }
    await loadMonths();
    await loadMonth(activeYm);
  }, [activeYm, loadMonth, loadMonths]);

  const turnoverMonth = isRioTurnoverMonth(activeYm);
  const monthClosed = Boolean(monthInfo?.closedAt);

  const caRefreshRunId = useRef(0);

  const mergeLinhasFromCaBatch = useCallback((updates: RioLinha[]) => {
    if (!updates.length) return;
    setLinhas((prev) => {
      const byId = new Map(updates.map((u) => [u.id, u]));
      return prev.map((l) => {
        const u = byId.get(l.id);
        return u ? { ...u, pdvs: u.pdvs?.length ? u.pdvs : l.pdvs } : l;
      });
    });
  }, []);

  const runCaBatchPhase = useCallback(
    async (
      mode: "refresh" | "match",
      runId: number,
      acc: { updated: number; failed: number; matched: number; ambiguous: number; notFound: number },
      opts?: {
        includePersonDetails?: boolean;
        includeContracts?: boolean;
        progressLabel?: string;
      },
    ) => {
      let offset = 0;
      const limit =
        mode === "refresh" ?
          rioCaRefreshBatchLimit({ includeContracts: opts?.includeContracts ?? true })
        : RIO_CA_REFRESH_BATCH_SIZE;
      const progressLabel = opts?.progressLabel ?? (mode === "match" ? "Casar CNPJ → CA" : "Atualizar vinculados CA");

      while (true) {
        if (caRefreshRunId.current !== runId) return;

        const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/refresh-linked-ca`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset,
            limit,
            mode,
            ...(mode === "refresh" ?
              {
                includePersonDetails: opts?.includePersonDetails ?? true,
                includeContracts: opts?.includeContracts ?? true,
              }
            : {}),
          }),
        });
        const { data, rawText } = await readJsonFromResponse<{
          refreshStats?: { updated: number; failed: number };
          matchStats?: { matched: number; ambiguous: number; notFound: number };
          progress?: {
            batchNumber: number;
            batchCount: number;
            batchFrom: number;
            batchTo: number;
            globalTotal: number;
            hasMore: boolean;
          };
          updatedLinhas?: RioLinha[];
          error?: string;
          message?: string;
          connected?: boolean;
        }>(res);

        if (!res.ok) {
          const proxyHtml =
            /inactivity\s+timeout/i.test(rawText) || /too much time has passed/i.test(rawText);
          if (proxyHtml) {
            throw new Error(
              "Timeout do servidor (Netlify). Com «Contratos» marcado usamos lotes de " +
                `${RIO_CA_REFRESH_BATCH_SIZE_WITH_CONTRACTS} clientes — tente de novo; se persistir, marque só «Contratos» (sem Enriquecer) ou aumente o limite de função no Netlify.`,
            );
          }
          throw new Error(
            data?.message || data?.error || rawText.slice(0, 220) || "Falha ao atualizar vínculos.",
          );
        }

        if (Array.isArray(data?.updatedLinhas)) mergeLinhasFromCaBatch(data.updatedLinhas);

        const p = data?.progress;
        if (p) {
          if (p.globalTotal === 0) {
            setMsg(
              mode === "match" ?
                "Nenhuma linha com CNPJ/CPF para casar neste lote."
              : "Nenhum cliente vinculado à CA para atualizar.",
            );
            return;
          }
          setMsg(
            `${progressLabel} — ação ${p.batchNumber} de ${p.batchCount}: clientes ${p.batchFrom}–${p.batchTo} de ${p.globalTotal}…`,
          );
        }

        if (mode === "refresh" && data?.refreshStats) {
          acc.updated += data.refreshStats.updated;
          acc.failed += data.refreshStats.failed;
        }
        if (mode === "match" && data?.matchStats) {
          acc.matched += data.matchStats.matched;
          acc.ambiguous += data.matchStats.ambiguous;
          acc.notFound += data.matchStats.notFound;
        }

        if (!p?.hasMore) break;
        offset += limit;
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    [activeYm, mergeLinhasFromCaBatch],
  );

  const runViradaBatched = useCallback(
    async (
      runId: number,
      opts: { includePersonDetails: boolean; includeContracts: boolean },
    ): Promise<{
      linhas: RioLinha[];
      grupos: RioGrupo[];
      count: number;
      caPersonListingCount: number;
      viradaStats?: { entrada: number; saida: number; estavel: number; novos: number };
    } | null> => {
      const post = async (body: Record<string, unknown>) => {
        const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/virada`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return readJsonFromResponse<Record<string, unknown>>(res);
      };

      setMsg("Virada — preparando backup…");
      {
        const { ok, status, data, parseError, rawText } = await post({ phase: "reset" });
        if (caRefreshRunId.current !== runId) return null;
        if (!ok || parseError) {
          setMsg((data?.error as string) || rawText.slice(0, 200) || `Erro ${status}`);
          return null;
        }
      }

      let page = 1;
      let activeCount = 0;
      for (;;) {
        if (caRefreshRunId.current !== runId) return null;
        setMsg(`Virada — listagem CA (página ${page})…`);
        const { ok, status, data, parseError, rawText } = await post({ phase: "ca_page", page });
        if (caRefreshRunId.current !== runId) return null;
        if (!ok || parseError) {
          setMsg((data?.error as string) || rawText.slice(0, 200) || `Erro ${status}`);
          return null;
        }
        activeCount = Number(data?.activeCount) || activeCount;
        if (!data?.hasMore) break;
        page += 1;
        await new Promise((r) => setTimeout(r, 0));
      }

      const accStats = { entrada: 0, saida: 0, estavel: 0, novos: 0 };
      let offset = 0;
      let totalLinhas = 0;
      for (;;) {
        if (caRefreshRunId.current !== runId) return null;
        const { ok, status, data, parseError, rawText } = await post({
          phase: "linhas",
          offset,
          limit: RIO_VIRADA_LINHAS_BATCH,
          includePersonDetails: opts.includePersonDetails,
          includeContracts: opts.includeContracts,
        });
        if (caRefreshRunId.current !== runId) return null;
        if (!ok || parseError) {
          setMsg((data?.error as string) || rawText.slice(0, 200) || `Erro ${status}`);
          return null;
        }
        totalLinhas = Number(data?.totalLinhas) || totalLinhas;
        const st = data?.stats as typeof accStats | undefined;
        if (st) {
          accStats.estavel += st.estavel ?? 0;
          accStats.saida += st.saida ?? 0;
        }
        const processed = Number(data?.processed) || 0;
        offset += processed;
        setMsg(
          `Virada — clientes na planilha ${Math.min(offset, totalLinhas)}/${totalLinhas || "…"}…`,
        );
        if (!data?.hasMore || processed === 0) break;
        await new Promise((r) => setTimeout(r, 0));
      }

      if (caRefreshRunId.current !== runId) return null;
      setMsg("Virada — novos clientes na Conta Azul…");
      const { ok, status, data, parseError, rawText } = await post({
        phase: "novos",
        includePersonDetails: opts.includePersonDetails,
        includeContracts: opts.includeContracts,
      });
      if (caRefreshRunId.current !== runId) return null;
      if (!ok || parseError) {
        setMsg((data?.error as string) || rawText.slice(0, 200) || `Erro ${status}`);
        return null;
      }

      const vs = data?.viradaStats as typeof accStats | undefined;
      if (vs) {
        accStats.novos = vs.novos ?? accStats.novos;
        accStats.entrada = vs.entrada ?? accStats.entrada;
      }

      return {
        linhas: (data?.linhas as RioLinha[]) ?? [],
        grupos: (data?.grupos as RioGrupo[]) ?? [],
        count: Number(data?.count) || 0,
        caPersonListingCount: activeCount,
        viradaStats: accStats,
      };
    },
    [activeYm],
  );

  const syncCa = useCallback(async () => {
    if (monthClosed) {
      setMsg("Esta competência está fechada — abra o mês seguinte para trabalhar.");
      return;
    }
    const runId = ++caRefreshRunId.current;
    setSyncing(true);
    setMsg(
      turnoverMonth ?
        "Virada do mês — listagem CA página a página…"
      : "Sincronizar — passo 1: listagem básica na CA…",
    );
    try {
      if (turnoverMonth) {
        const virada = await runViradaBatched(runId, {
          includePersonDetails: syncIncludePersonDetails,
          includeContracts: syncIncludeContracts,
        });
        if (caRefreshRunId.current !== runId || !virada) return;

        setLinhas(virada.linhas);
        setGrupos(virada.grupos);
        setMonthInfo((m) => ({
          lastSyncedAt: new Date().toISOString(),
          closedAt: m?.closedAt ?? null,
        }));

        const vs = virada.viradaStats;
        const viradaHint = vs ?
          ` ${vs.estavel} estáveis, ${vs.entrada} entrando (novos ${vs.novos}), ${vs.saida} saindo.`
        : "";

        if (syncIncludePersonDetails || syncIncludeContracts) {
          const acc = { updated: 0, failed: 0, matched: 0, ambiguous: 0, notFound: 0 };
          await runCaBatchPhase("refresh", runId, acc, {
            includePersonDetails: syncIncludePersonDetails,
            includeContracts: syncIncludeContracts,
            progressLabel: "Virada — enriquecer vínculos",
          });
        }

        if (caRefreshRunId.current !== runId) return;

        setMsg(
          `Virada do mês: ${virada.count} linhas (${virada.caPersonListingCount} ativos na CA).${viradaHint} Listagem em páginas + lotes de ${RIO_VIRADA_LINHAS_BATCH}.`,
        );
        await loadMonths();
        return;
      }

      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeContracts: false,
          includePersonDetails: false,
        }),
      });
      const { data, rawText, parseError } = await readJsonFromResponse<{
        grupos?: RioGrupo[];
        linhas?: RioLinha[];
        error?: string;
        count?: number;
        caPersonListingCount?: number;
        syncedContractsFromCa?: boolean;
        syncedPersonDetailsFromCa?: boolean;
        virada?: boolean;
        viradaStats?: { entrada: number; saida: number; estavel: number; novos: number };
      }>(res);
      if (!res.ok) {
        const proxyHtml =
          parseError &&
          (/inactivity\s+timeout/i.test(rawText) ||
            /too much time has passed/i.test(rawText));
        if (proxyHtml) {
          setMsg(
            "O servidor ou a rede cortaram o pedido por tempo (timeout). Isto pode ser: (1) muitos clientes e várias chamadas à Conta Azul (detalhes de pessoa ou contratos); (2) limite ~10 s no Netlify Free / ~26 s no plano seguinte — deixe as duas caixas abaixo desmarcadas e sincronize (só traz lista básica). Depois, se precisares de e-mails e contratos vindos da CA, marca primeiro «Enriquecer cadastro», sincroniza; só então marca «Contratos». Em alternativa aumenta o tempo limite das funções no Netlify.",
          );
          return;
        }
        const code = data?.error;
        const friendly =
          code === "conta_azul_disconnected" ?
            "Conta Azul desconectada: reconecte o portal (integração OAuth) e tente de novo."
          : ((code ?? rawText.slice(0, 220)) || `Erro ${res.status}`);
        setMsg(friendly);
        return;
      }
      setLinhas(data?.linhas ?? []);
      setGrupos(Array.isArray(data?.grupos) ? data!.grupos! : []);
      setMonthInfo((m) => ({
        lastSyncedAt: new Date().toISOString(),
        closedAt: m?.closedAt ?? null,
      }));
      const n = data?.count ?? data?.linhas?.length ?? 0;
      const listed = data?.caPersonListingCount;
      const listedHint =
        typeof listed === "number" ?
          ` (${listed} registros «Cliente» na listagem CA${listed === 0 ? " — nada retornado pela API neste critério" : ""})`
        : "";
      const vs = data?.viradaStats;
      const viradaHint =
        data?.virada && vs ?
          ` ${vs.estavel} estáveis, ${vs.entrada} entrando (novos ${vs.novos}), ${vs.saida} saindo.`
        : "";

      const acc = { updated: 0, failed: 0, matched: 0, ambiguous: 0, notFound: 0 };
      const enrichLabel =
        turnoverMonth ? "Virada do mês" : (
          syncIncludePersonDetails && syncIncludeContracts ? "Sincronizar Conta Azul"
        : syncIncludePersonDetails ? "Enriquecer cadastro"
        : "Contratos CA");

      if (syncIncludePersonDetails || syncIncludeContracts) {
        if (caRefreshRunId.current !== runId) return;
        await runCaBatchPhase("refresh", runId, acc, {
          includePersonDetails: syncIncludePersonDetails,
          includeContracts: syncIncludeContracts,
          progressLabel: `${enrichLabel} — passo 2`,
        });
      }

      if (caRefreshRunId.current !== runId) return;

      const enrichParts: string[] = [];
      if (syncIncludePersonDetails || syncIncludeContracts) {
        enrichParts.push(
          `Passo 2 (${RIO_CA_REFRESH_BATCH_SIZE} em ${RIO_CA_REFRESH_BATCH_SIZE}): ${acc.updated} atualizado(s)${acc.failed ? `, ${acc.failed} falha` : ""}.`,
        );
      }
      const contrHint =
        syncIncludeContracts ? " Contratos CA atualizados em lotes."
        : " Contratos: não buscados nesta sync.";
      const detailHint =
        syncIncludePersonDetails ?
          " Cadastro enriquecido em lotes (e-mail, razão, etc.)."
        : " Cadastro: só listagem básica (passo 1).";

      setMsg(
        (data?.virada ? `Virada do mês: ${n} linhas.` : `Sincronizado: ${n} linhas.`) +
          listedHint +
          viradaHint +
          contrHint +
          detailHint +
          (enrichParts.length ? ` ${enrichParts.join(" ")}` : ""),
      );
      await loadMonths();
    } catch (e) {
      if (caRefreshRunId.current === runId) {
        setMsg(e instanceof Error ? e.message : "Falha na sincronização.");
      }
    } finally {
      if (caRefreshRunId.current === runId) setSyncing(false);
    }
  }, [
    activeYm,
    monthClosed,
    syncIncludeContracts,
    syncIncludePersonDetails,
    loadMonths,
    turnoverMonth,
    runCaBatchPhase,
    runViradaBatched,
  ]);

  const runCloneDonorBatched = useCallback(
    async (targetYm: number, closeDonorWhenDone: boolean) => {
      const post = async (body: Record<string, unknown>) => {
        const res = await fetch(
          `/api/rio-planilha/clientes/month/${targetYm}/clone-from-donor`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        return readJsonFromResponse<Record<string, unknown>>(res);
      };

      setMsg(`Copiando MARCAs de ${formatYearMonthLabel(donorYearMonthFor(targetYm))}…`);
      {
        const { ok, status, data, parseError, rawText } = await post({
          phase: "reset",
          closeDonorWhenDone,
        });
        if (!ok || parseError) {
          const proxyHtml =
            parseError &&
            (/inactivity\s+timeout/i.test(rawText) || /too much time has passed/i.test(rawText));
          setMsg(
            proxyHtml ?
              "Timeout ao iniciar cópia — tente de novo; o deploy deve usar lotes de 10."
            : (data?.error as string) || rawText.slice(0, 200) || `Erro ${status}`,
          );
          return false;
        }
      }

      let offset = 0;
      let total = 0;
      for (;;) {
        const { ok, status, data, parseError, rawText } = await post({
          phase: "linhas",
          offset,
          limit: RIO_CLONE_DONOR_BATCH_SIZE,
        });
        if (!ok || parseError) {
          setMsg(
            (data?.error as string) ||
              rawText.slice(0, 200) ||
              `Erro ${status} no lote ${offset} — clique «Copiar de…» de novo para continuar.`,
          );
          return false;
        }
        total = Number(data?.total) || total;
        const nextOffset = Number(data?.nextOffset) || offset + RIO_CLONE_DONOR_BATCH_SIZE;
        offset = nextOffset;
        setMsg(
          `Copiando clientes e PDVs… ${Math.min(offset, total)}/${total || "…"} (lotes de ${RIO_CLONE_DONOR_BATCH_SIZE})`,
        );
        if (!data?.hasMore) break;
        await new Promise((r) => setTimeout(r, 0));
      }

      const { ok, status, data, parseError, rawText } = await post({ phase: "finish" });
      if (!ok || parseError) {
        setMsg((data?.error as string) || rawText.slice(0, 200) || `Erro ${status}`);
        return false;
      }

      if (Array.isArray(data?.linhas)) setLinhas(data.linhas as RioLinha[]);
      if (Array.isArray(data?.grupos)) setGrupos(data.grupos as RioGrupo[]);
      setMsg((data?.message as string) ?? "Cópia concluída.");
      await loadMonths();
      await loadMonth(targetYm);
      return true;
    },
    [loadMonth, loadMonths],
  );

  const cloneFromDonorMonth = useCallback(async () => {
    if (monthClosed) {
      setMsg("Competência fechada.");
      return;
    }
    const donor = donorYearMonthFor(activeYm);
    if (
      !window.confirm(
        `Copiar todo o trabalho de ${formatYearMonthLabel(donor)} para ${formatYearMonthLabel(activeYm)}?\n\nSubstitui linhas, MARCA e PDVs em lotes de ${RIO_CLONE_DONOR_BATCH_SIZE}.`,
      )
    ) {
      return;
    }
    setSyncing(true);
    try {
      await runCloneDonorBatched(activeYm, false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao copiar mês anterior.");
    } finally {
      setSyncing(false);
    }
  }, [monthClosed, activeYm, runCloneDonorBatched]);

  const singleMonthInBase = months.length <= 1;

  const revertLastSync = useCallback(async () => {
    if (monthClosed) {
      setMsg("Esta competência está fechada.");
      return;
    }
    const confirmText =
      singleMonthInBase ?
        "Só existe esta competência na base (não há mês anterior).\n\n" +
          "O sync de maio não pode ser «desfeito» por completo. O que dá para fazer agora:\n" +
          "• remover linhas de clientes **inativos** na Conta Azul importados no sync;\n" +
          "• manter clientes manuais e linhas que ainda estão ativos na CA.\n\n" +
          "MARCAs apagadas no sync **não** voltam sozinhas — recrie ou importe um ficheiro.\n\n" +
          "Continuar?"
      : "Desfazer a última virada/sync desta competência?\n\n" +
          "• Com backup automático: volta ao instante antes do clique.\n" +
          "• Sem backup: repõe a partir do mês anterior na base.\n" +
          "• Senão: remove só clientes inativos na CA.";
    if (!window.confirm(confirmText)) {
      return;
    }
    setRevertingSync(true);
    setMsg("Desfazendo último sync…");
    try {
      const res = await fetch(
        `/api/rio-planilha/clientes/month/${activeYm}/revert-sync`,
        { method: "POST", credentials: "include" },
      );
      const { data, rawText } = await readJsonFromResponse<{
        ok?: boolean;
        mode?: "snapshot" | "donor_clone" | "purge_inactive";
        message?: string;
        linhas?: RioLinha[];
        grupos?: RioGrupo[];
        removed?: number;
        error?: string;
      }>(res);
      if (!res.ok) {
        setMsg((data?.error ?? rawText.slice(0, 200)) || `Erro ${res.status}`);
        return;
      }
      setLinhas(data?.linhas ?? []);
      setGrupos(Array.isArray(data?.grupos) ? data!.grupos! : []);
      setMsg(data?.message ?? "Sync desfeito.");
      await loadMonths();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao desfazer sync.");
    } finally {
      setRevertingSync(false);
    }
  }, [activeYm, monthClosed, loadMonths, singleMonthInBase]);

  const runImportFile = useCallback(
    async (file: File) => {
      if (
        !window.confirm(
          "Importar substitui todas as linhas e PDVs desta competência pelo ficheiro. Não há ligação à API Conta Azul neste passo. Continuar?",
        )
      )
        return;
      setImporting(true);
      setMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("inferMovement", importInferMovement ? "1" : "0");
        const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/import`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const { data, rawText } = await readJsonFromResponse<{
          grupos?: RioGrupo[];
          linhas?: RioLinha[];
          error?: string;
          count?: number;
          warnings?: string[];
          inferMovementVsPriorMonth?: boolean;
        }>(res);
        if (!res.ok) {
          setMsg(data?.error || rawText.slice(0, 220) || `Erro ${res.status}`);
          return;
        }
        setLinhas(data?.linhas ?? []);
        setGrupos(Array.isArray(data?.grupos) ? data!.grupos! : []);
        setMonthInfo((m) => ({
        lastSyncedAt: new Date().toISOString(),
        closedAt: m?.closedAt ?? null,
      }));
        const w = Array.isArray(data?.warnings) ? data!.warnings.filter(Boolean) : [];
        const warnTxt = w.length ? ` Avisos: ${w.join(" ")}` : "";
        const inferTxt =
          data?.inferMovementVsPriorMonth ?
            " Movimento entrada/saída/estável calculado face ao mês anterior na base."
          : " Movimento ficou só o definido nas colunas do ficheiro.";
        setMsg(`Importado: ${data?.count ?? data?.linhas?.length ?? 0} linhas.${inferTxt}${warnTxt}`);
        await loadMonths();
        await loadMonth(activeYm);
      } catch {
        setMsg("Falha ao importar ficheiro.");
      } finally {
        setImporting(false);
      }
    },
    [activeYm, loadMonth, loadMonths, importInferMovement],
  );

  const runMarcaLayoutImport = useCallback(
    async (file: File) => {
      if (
        !window.confirm(
          "Este ficheiro aplica apenas MARCA (col. A), categoria (H) e lista de PDVs (B/C conforme planilha interna). Não altera CNPJ nem valor mensal nas linhas; os clientes têm de existir já nesta competência (sync ou import CSV). Continuar?",
        )
      )
        return;
      setImporting(true);
      setMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/import-marca-layout`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const { data, rawText } = await readJsonFromResponse<{
          grupos?: RioGrupo[];
          linhas?: RioLinha[];
          error?: string;
          warnings?: string[];
          appliedCount?: number;
          unmatchedLabels?: string[];
          unmatchedCount?: number;
        }>(res);
        if (!res.ok) {
          setMsg(data?.error || rawText.slice(0, 220) || `Erro ${res.status}`);
          return;
        }
        setLinhas(data?.linhas ?? []);
        setGrupos(Array.isArray(data?.grupos) ? data!.grupos! : []);
        const w = Array.isArray(data?.warnings) ? data!.warnings.filter(Boolean) : [];
        const applied = typeof data?.appliedCount === "number" ? data.appliedCount : 0;
        const unLabels = Array.isArray(data?.unmatchedLabels) ? data!.unmatchedLabels : [];
        const un =
          typeof data?.unmatchedCount === "number" ?
            data.unmatchedCount
          : unLabels.length;
        const unPreview =
          un > 0 && unLabels.length ?
            ` (${unLabels.slice(0, 10).join(", ")}${unLabels.length > 10 ? ", …" : ""})`
          : "";
        const unHint =
          un > 0 ?
            ` ${un} nome${un !== 1 ? "s" : ""} não encontrado${un !== 1 ? "s" : ""} no portal.${unPreview}`
          : "";
        const warnTxt = w.length ? ` Avisos: ${w.slice(0, 12).join(" ")}${w.length > 12 ? "…" : ""}` : "";
        setMsg(`Layout MARCA/PDVs aplicado: ${applied} clientes atualizados.${unHint}${warnTxt}`);
      } catch {
        setMsg("Falha ao importar layout MARCA+PDVs.");
      } finally {
        setImporting(false);
      }
    },
    [activeYm],
  );

  const patchLinha = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/linha/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { data } = await readJsonFromResponse<{ linha?: RioLinha }>(res);
      if (!res.ok || !data?.linha) return;
      setLinhas((prev) =>
        prev.map((x) =>
          x.id === id ? { ...data.linha!, pdvs: data.linha!.pdvs ?? x.pdvs } : x,
        ),
      );
    },
    [activeYm],
  );

  const addPdvsBulk = useCallback(
    async (linhaId: string, rows: ParsedPdvRow[]) => {
      if (!rows.length) return;
      const res = await fetch(
        `/api/rio-planilha/clientes/month/${activeYm}/linha/${encodeURIComponent(linhaId)}/pdvs/bulk`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdvs: rows }),
        },
      );
      const { data, rawText } = await readJsonFromResponse<{
        pdvs?: RioPdv[];
        createdCount?: number;
        updatedCount?: number;
        skippedCount?: number;
        numeroPdvSite?: number;
        valorClienteTexto?: string;
        error?: string;
        message?: string;
      }>(res);
      if (!res.ok) {
        setHttpError({
          action: "addPdvsBulk",
          method: "POST",
          url: `/api/rio-planilha/clientes/month/${activeYm}/linha/${linhaId}/pdvs/bulk`,
          userMessage:
            data?.message ||
            data?.error ||
            rawText.slice(0, 220) ||
            "Falha ao adicionar PDVs.",
          ok: res.ok,
          status: res.status,
          rawText,
          data,
          requestBody: { pdvs: rows },
          context: { activeYm, linhaId, pdvCount: rows.length },
        });
        return;
      }
      if (Array.isArray(data?.pdvs)) {
        const nPdv =
          typeof data?.numeroPdvSite === "number" ? data.numeroPdvSite : data!.pdvs!.length;
        setLinhas((prev) =>
          prev.map((l) =>
            l.id === linhaId ?
              {
                ...l,
                pdvs: sortRioPdvsByNome(data!.pdvs!),
                numeroPdvSite: nPdv,
                valorClienteTexto:
                  typeof data?.valorClienteTexto === "string" ?
                    data.valorClienteTexto
                  : l.valorClienteTexto,
              }
            : l,
          ),
        );
      }
      setExpanded((prev) => {
        const nx = new Set(prev);
        nx.add(linhaId);
        return nx;
      });
      const created = data?.createdCount ?? 0;
      const updated = data?.updatedCount ?? 0;
      const skipped = data?.skippedCount ?? 0;
      const clienteNome = linhas.find((l) => l.id === linhaId)?.nomeFantasia ?? "cliente";
      if (created || updated || skipped) {
        const parts: string[] = [];
        if (created) parts.push(`${created} novo(s)`);
        if (updated) parts.push(`${updated} atualizado(s) (CNPJ ou reativado após remover)`);
        if (skipped) parts.push(`${skipped} já iguais`);
        setMsg(`PDVs em «${clienteNome}»: ${parts.join(" · ")}.`);
      } else {
        setMsg("Nenhum PDV novo.");
      }
    },
    [activeYm, linhas, setHttpError],
  );

  const addPdv = useCallback(
    async (linhaId: string) => {
      const nome = (newPdvName[linhaId] ?? "").trim();
      const res = await fetch(
        `/api/rio-planilha/clientes/month/${activeYm}/linha/${linhaId}/pdv`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        },
      );
      const { data, rawText } = await readJsonFromResponse<{
        pdv?: RioPdv;
        numeroPdvSite?: number;
        valorClienteTexto?: string;
        error?: string;
        message?: string;
      }>(res);
      if (!res.ok || !data?.pdv) {
        setHttpError({
          action: "addPdv",
          method: "POST",
          url: `/api/rio-planilha/clientes/month/${activeYm}/linha/${linhaId}/pdv`,
          userMessage:
            data?.message ||
            data?.error ||
            rawText.slice(0, 220) ||
            "Falha ao adicionar PDV.",
          ok: res.ok,
          status: res.status,
          rawText,
          data,
          requestBody: { nome },
          context: { activeYm, linhaId },
        });
        return;
      }
      setNewPdvName((m) => ({ ...m, [linhaId]: "" }));
      const nPdv =
        typeof data.numeroPdvSite === "number" ? data.numeroPdvSite : undefined;
      setLinhas((prev) =>
        prev.map((x) => {
          if (x.id !== linhaId) return x;
          const pdvs = sortRioPdvsByNome([...x.pdvs, data.pdv!]);
          return {
            ...x,
            pdvs,
            numeroPdvSite: nPdv ?? pdvs.length,
            valorClienteTexto:
              typeof data.valorClienteTexto === "string" ?
                data.valorClienteTexto
              : x.valorClienteTexto,
          };
        }),
      );
    },
    [activeYm, newPdvName, setHttpError],
  );

  const patchPdv = useCallback(
    async (
      pdvId: string,
      patch: { nome?: string; documento?: string | null; tagCobranca?: import("@/lib/rio/rioTagCobranca").RioTagCobranca },
    ) => {
      const res = await fetch(`/api/rio-planilha/clientes/pdv/${pdvId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const { data } = await readJsonFromResponse<{ pdv?: RioPdv }>(res);
      if (!res.ok || !data?.pdv) return;
      setLinhas((prev) =>
        prev.map((ln) => ({
          ...ln,
          pdvs: sortRioPdvsByNome(
            ln.pdvs.map((p) =>
              p.id === pdvId ?
                {
                  ...p,
                  nome: data.pdv!.nome,
                  documento: data.pdv!.documento ?? null,
                  tagCobranca: data.pdv!.tagCobranca ?? p.tagCobranca,
                }
              : p,
            ),
          ),
        })),
      );
    },
    [],
  );

  const delLinha = useCallback(
    async (r: RioLinha) => {
      if (monthClosed) {
        setMsg("Competência fechada — não é possível apagar linhas.");
        return;
      }
      if (
        !window.confirm(
          `Apagar «${r.nomeFantasia}» desta competência?\n\nRemove a linha e os PDVs internos. Não altera o cadastro na Conta Azul.`,
        )
      ) {
        return;
      }
      const res = await fetch(
        `/api/rio-planilha/clientes/month/${activeYm}/linha/${encodeURIComponent(r.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const { data, rawText } = await readJsonFromResponse<{
        linhas?: RioLinha[];
        grupos?: RioGrupo[];
        error?: string;
      }>(res);
      if (!res.ok) {
        setMsg(data?.error || rawText.slice(0, 200) || "Falha ao apagar cliente.");
        return;
      }
      if (Array.isArray(data?.linhas)) setLinhas(data.linhas);
      else setLinhas((prev) => prev.filter((l) => l.id !== r.id));
      if (Array.isArray(data?.grupos)) setGrupos(data.grupos);
      setExpanded((prev) => {
        const nx = new Set(prev);
        nx.delete(r.id);
        return nx;
      });
      setLinkModalLinha((cur) => (cur?.id === r.id ? null : cur));
      setMsg(`Cliente «${r.nomeFantasia}» removido desta competência.`);
    },
    [activeYm, monthClosed],
  );

  const delPdv = useCallback(async (pdvId: string) => {
    const res = await fetch(`/api/rio-planilha/clientes/pdv/${pdvId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const { data } = await readJsonFromResponse<{
      clienteId?: string;
      numeroPdvSite?: number;
      valorClienteTexto?: string;
    }>(res);
    if (!res.ok) return;
    setLinhas((prev) =>
      prev.map((ln) => {
        const had = ln.pdvs.some((p) => p.id === pdvId);
        if (!had) return ln;
        const pdvs = sortRioPdvsByNome(ln.pdvs.filter((p) => p.id !== pdvId));
        const nPdv =
          data?.clienteId === ln.id && typeof data.numeroPdvSite === "number" ?
            data.numeroPdvSite
          : pdvs.length;
        return {
          ...ln,
          pdvs,
          numeroPdvSite: nPdv,
          valorClienteTexto:
            data?.clienteId === ln.id && typeof data.valorClienteTexto === "string" ?
              data.valorClienteTexto
            : ln.valorClienteTexto,
        };
      }),
    );
  }, []);

  const grupoOrd = useMemo(() => sortRioCompGruposForDisplay(grupos), [grupos]);

  const systemGrupoOrd = useMemo(() => grupoOrd.filter((g) => g.systemTag), [grupoOrd]);
  const userGrupoOrd = useMemo(() => grupoOrd.filter((g) => !g.systemTag), [grupoOrd]);

  const { map: buckets, orphans } = useMemo(() => bucketize(grupoOrd, linhas), [grupoOrd, linhas]);

  const monthTotals = useMemo(() => sumRioLinhasTotals(linhas), [linhas]);

  const persistBuckets = useCallback(
    async (mapArg: Map<string, RioLinha[]>, orphansArg: RioLinha[]) => {
      const items: { id: string; rio_grupo_id: string | null; sort_order: number }[] = [];
      let ord = 0;
      for (const g of grupoOrd) {
        const lst = mapArg.get(g.id) ?? [];
        for (const l of lst) {
          items.push({ id: l.id, rio_grupo_id: g.id, sort_order: ord });
          ord += 1;
        }
      }
      for (const l of orphansArg) {
        items.push({ id: l.id, rio_grupo_id: null, sort_order: ord });
        ord += 1;
      }
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/linhas/layout`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const { data, rawText } = await readJsonFromResponse<{ linhas?: RioLinha[]; grupos?: RioGrupo[] }>(res);
      if (!res.ok) {
        const errMsg =
          data && typeof data === "object" && data !== null && "error" in data ?
            String((data as { error: string }).error)
          : rawText.slice(0, 220);
        setMsg(errMsg);
        return;
      }
      if (Array.isArray(data?.linhas)) setLinhas(data!.linhas!);
      if (Array.isArray(data?.grupos)) setGrupos(data!.grupos!);
      setMsg(null);
    },
    [activeYm, grupoOrd],
  );

  const reorderMesmaMarca = useCallback(
    async (marcaId: string | null, activeId: string, overId: string) => {
      const mapClone = new Map(buckets);
      let list = marcaId ? [...(mapClone.get(marcaId) ?? [])] : [...orphans];
      const oi = list.findIndex((x) => x.id === activeId);
      const ni = list.findIndex((x) => x.id === overId);
      if (oi < 0 || ni < 0 || oi === ni) return;
      list = arrayMove(list, oi, ni).map((x) =>
        marcaId ?
          ({
            ...x,
            rioGrupoId: marcaId,
            grupo: grupoOrd.find((g) => g.id === marcaId) ?? null,
            grupoSite: grupoOrd.find((g) => g.id === marcaId)?.nome ?? x.grupoSite,
          })
        : {
            ...x,
            rioGrupoId: null,
            grupo: null,
            grupoSite: "",
          },
      );
      if (marcaId) mapClone.set(marcaId, list);
      const orphansNext = marcaId ? [...orphans] : list;
      await persistBuckets(mapClone, orphansNext);
    },
    [buckets, orphans, grupoOrd, persistBuckets],
  );

  const moveLinhaEntreMarcas = useCallback(
    async (linhaId: string, marcaSel: string) => {
      const targetId = marcaSel.trim().length ? marcaSel : null;
      const ln = linhas.find((x) => x.id === linhaId);
      if (!ln) return;

      const g = targetId ? grupoOrd.find((gg) => gg.id === targetId) : null;
      if (targetId && !g) {
        setMsg("MARCA não encontrada — recarregue a página e tente de novo.");
        return;
      }

      const targetList = targetId ? (buckets.get(targetId) ?? []) : orphans;
      const sortOrder = targetList.reduce((m, l) => Math.max(m, l.sortOrder ?? 0), -1) + 1;

      const optimistic: RioLinha = {
        ...ln,
        rioGrupoId: targetId,
        grupo: g ?? null,
        grupoSite: g?.nome ?? "",
        sortOrder,
      };
      setLinhas((prev) => prev.map((x) => (x.id === linhaId ? optimistic : x)));

      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/linha/${linhaId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rioGrupoId: targetId, sortOrder }),
      });
      const { data, rawText } = await readJsonFromResponse<{
        linha?: RioLinha;
        error?: string;
      }>(res);

      if (!res.ok || !data?.linha) {
        setLinhas((prev) => prev.map((x) => (x.id === linhaId ? ln : x)));
        setMsg(
          data?.error === "grupo_not_found" ?
            "MARCA inválida nesta competência."
          : (data?.error || rawText.slice(0, 200) || "Não foi possível mudar a MARCA do cliente."),
        );
        return;
      }

      setLinhas((prev) =>
        prev.map((x) =>
          x.id === linhaId ? { ...data.linha!, pdvs: data.linha!.pdvs ?? x.pdvs } : x,
        ),
      );
      setMsg(null);
    },
    [activeYm, buckets, orphans, grupoOrd, linhas],
  );

  const deslocarBlocoMarca = useCallback(
    async (ix: number, delta: number) => {
      const systemIds = systemGrupoOrd.map((g) => g.id);
      const userIds = userGrupoOrd.map((g) => g.id);
      const j = ix + delta;
      if (j < 0 || j >= userIds.length) return;
      const nextIds = [...systemIds, ...arrayMove(userIds, ix, j)];
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/grupos`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: nextIds }),
      });
      const { data, rawText } = await readJsonFromResponse<{ linhas?: RioLinha[]; grupos?: RioGrupo[] }>(res);
      if (!res.ok) {
        setMsg(rawText.slice(0, 200));
        return;
      }
      if (Array.isArray(data?.grupos)) setGrupos(data!.grupos!);
      if (Array.isArray(data?.linhas)) setLinhas(data!.linhas!);
    },
    [activeYm, systemGrupoOrd, userGrupoOrd],
  );

  const scrollToRioLinha = useCallback((targetLinhaId: string) => {
    const el = document.getElementById(`rio-linha-${targetLinhaId}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-500", "ring-offset-2", "dark:ring-amber-400");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-amber-500", "ring-offset-2", "dark:ring-amber-400");
    }, 4500);
    return true;
  }, []);

  type CaLinkResult =
    | { ok: true; hints: string[] }
    | {
        ok: false;
        message: string;
        error?: string;
        clashLinhaId?: string | null;
      };

  const postRefreshCaLinha = useCallback(
    async (linhaId: string, body: Record<string, unknown>): Promise<CaLinkResult> => {
      setCaLinkBusy(true);
      setClashNavLinhaId(null);
      try {
        const res = await fetch(
          `/api/rio-planilha/clientes/month/${activeYm}/linha/${encodeURIComponent(linhaId)}/refresh-ca`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          },
        );
        const { data, rawText } = await readJsonFromResponse<{
          connected?: boolean;
          message?: string;
          billingEmailsEmptyHint?: string | null;
          contractValorEmptyHint?: string | null;
          error?: string;
          detail?: string | null;
          errorDetail?: string;
          caCheck?: {
            reasons?: string[];
            snapshot?: {
              ativo?: unknown;
              situacao?: string;
              perfis?: string[];
            };
          };
          clashLinhaId?: string | null;
          clashGrupoNome?: string | null;
          clashSystemTag?: string | null;
          linha?: RioLinha;
        }>(res);
        if (data?.connected === false && data.message) {
          return { ok: false, message: data.message, error: "ca_disconnected" };
        }
        if (!res.ok) {
          if (data?.error === "ca_person_already_linked") {
            const nome = data.detail?.trim() || "outro cliente";
            const grupo = data.clashGrupoNome?.trim() || "Sem MARCA";
            const blocoHint =
              data.clashSystemTag === "ca_entrada" ?
                ` Está no bloco «${grupo}» (topo da planilha — virada do mês).`
              : data.clashSystemTag === "ca_saida" ?
                ` Está no bloco «${grupo}» (clientes saindo — topo da planilha).`
              : data.clashSystemTag ?
                ` Está no bloco «${grupo}».`
              : ` Está na MARCA «${grupo}».`;
            const message = `Esta pessoa CA já está noutra linha deste mês: ${nome}.${blocoHint}`;
            if (data.clashLinhaId) {
              setClashNavLinhaId(data.clashLinhaId);
              window.setTimeout(() => scrollToRioLinha(data.clashLinhaId!), 150);
            }
            return {
              ok: false,
              message,
              error: data.error,
              clashLinhaId: data.clashLinhaId,
            };
          }
          if (data?.error === "ca_person_inactive") {
            const snap = data.caCheck?.snapshot;
            const snapHint =
              snap ?
                ` (CA: ativo=${JSON.stringify(snap.ativo)}${snap.situacao ? `, situacao=${snap.situacao}` : ""}${snap.perfis?.length ? `, perfis=${snap.perfis.join("/")}` : ""})`
              : "";
            return {
              ok: false,
              message: (data.detail || "Só é possível vincular clientes ativos na Conta Azul.") + snapHint,
              error: data.error,
            };
          }
          const err =
            data?.detail ||
            data?.errorDetail ||
            data?.error ||
            rawText.slice(0, 240) ||
            "Falha ao vincular.";
          return { ok: false, message: err, error: data?.error };
        }
        const hints = [data?.billingEmailsEmptyHint, data?.contractValorEmptyHint].filter(
          (h): h is string => Boolean(h),
        );
        if (data?.linha) {
          setLinhas((prev) =>
            prev.map((x) =>
              x.id === linhaId ? { ...data.linha!, pdvs: data.linha!.pdvs ?? x.pdvs } : x,
            ),
          );
        }
        return { ok: true, hints };
      } finally {
        setCaLinkBusy(false);
      }
    },
    [activeYm, scrollToRioLinha],
  );

  const onOpenCaLink = useCallback((r: RioLinha) => {
    setBuscaCa(r.documento?.replace(/\D/g, "").slice(0, 14) || r.nomeFantasia.split(" ").slice(0, 4).join(" "));
    setLinkModalNotice(null);
    setLinkHitFeedback({});
    setLinkModalLinha(r);
  }, []);

  const onToggleCaLink = useCallback(
    async (r: RioLinha) => {
      if (!window.confirm(`Desvincular «${r.nomeFantasia}» da Conta Azul nesta competência?`)) return;
      const result = await postRefreshCaLinha(r.id, { personId: "" });
      if (result.ok) setMsg("Vínculo CA removido nesta linha.");
      else setMsg(result.message);
    },
    [postRefreshCaLinha],
  );

  const onLinkCaHit = useCallback(
    async (hit: { id: string; nome: string }) => {
      if (!linkModalLinha) return;
      setLinkHitFeedback((prev) => ({
        ...prev,
        [hit.id]: { status: "busy", message: "Vinculando…" },
      }));
      const result = await postRefreshCaLinha(linkModalLinha.id, {
        personId: hit.id,
        caNomeLista: hit.nome,
      });
      if (result.ok) {
        setLinkHitFeedback((prev) => ({
          ...prev,
          [hit.id]: { status: "ok", message: "Vinculado!" },
        }));
        window.setTimeout(() => {
          setLinkModalLinha(null);
          setBuscaCa("");
          setLinkHitFeedback({});
          setMsg(
            result.hints.length ?
              `Vinculado a «${hit.nome}». ${result.hints.join(" ")}`
            : `Vinculado a «${hit.nome}» — nome fantasia e dados importados da Conta Azul.`,
          );
        }, 450);
        return;
      }
      setLinkHitFeedback((prev) => ({
        ...prev,
        [hit.id]: { status: "error", message: result.message },
      }));
      if (result.clashLinhaId) {
        setMsg(result.message);
      }
    },
    [linkModalLinha, postRefreshCaLinha],
  );

  const refreshLinkedFromCa = useCallback(
    async (matchByDocument: boolean) => {
      const enrichPerson = matchByDocument || syncIncludePersonDetails;
      const enrichContracts = matchByDocument || syncIncludeContracts;
      if (!matchByDocument && !enrichPerson && !enrichContracts) {
        setMsg(
          "Marque «Enriquecer cadastro» e/ou «Contratos» acima — a atualização da CA corre em lotes de 10 clientes.",
        );
        return;
      }
      const runId = ++caRefreshRunId.current;
      setRefreshingCa(true);
      setMsg(null);
      const acc = { updated: 0, failed: 0, matched: 0, ambiguous: 0, notFound: 0 };

      try {
        if (matchByDocument) {
          await runCaBatchPhase("match", runId, acc);
          if (caRefreshRunId.current !== runId) return;
        }
        await runCaBatchPhase("refresh", runId, acc, {
          includePersonDetails: enrichPerson,
          includeContracts: enrichContracts,
        });
        if (caRefreshRunId.current !== runId) return;

        const parts: string[] = [];
        if (matchByDocument) {
          parts.push(
            `Casados por CNPJ/CPF: ${acc.matched}. Ambíguos/duplicados: ${acc.ambiguous}. Sem match: ${acc.notFound}.`,
          );
        }
        parts.push(
          `Atualizados da CA: ${acc.updated}${acc.failed ? ` (${acc.failed} falha)` : ""}.`,
        );
        setMsg(parts.join(" ") || "Atualização concluída.");
      } catch (e) {
        if (caRefreshRunId.current === runId) {
          setMsg(e instanceof Error ? e.message : "Falha ao atualizar vínculos.");
        }
      } finally {
        if (caRefreshRunId.current === runId) setRefreshingCa(false);
      }
    },
    [runCaBatchPhase, syncIncludeContracts, syncIncludePersonDetails],
  );

  const criarMarca = useCallback(async () => {
    const raw = window.prompt("Nome da MARCA (tipo coluna MARCA no PDF):");
    if (raw === null) return;
    const nome = raw.trim();
    const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/grupos`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome || "Nova MARCA" }),
    });
    const { data, rawText } = await readJsonFromResponse<{ linhas?: RioLinha[]; grupos?: RioGrupo[] }>(res);
    if (!res.ok) {
      setMsg(rawText.slice(0, 200));
      return;
    }
    if (Array.isArray(data?.grupos)) setGrupos(data!.grupos!);
    if (Array.isArray(data?.linhas)) setLinhas(data!.linhas!);
    setMsg("MARCA criada — atribua clientes pela coluna ou arraste dentro do bloco.");
  }, [activeYm]);

  const criarCliente = useCallback(async () => {
    if (monthClosed) {
      setMsg("Competência fechada — não é possível adicionar clientes.");
      return;
    }
    const raw = window.prompt("Nome do cliente (pode editar depois e vincular à Conta Azul):");
    if (raw === null) return;
    const nomeFantasia = raw.trim() || "Novo cliente";
    const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/linhas`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomeFantasia }),
    });
    const { data, rawText } = await readJsonFromResponse<{
      linha?: RioLinha;
      linhas?: RioLinha[];
      grupos?: RioGrupo[];
      error?: string;
    }>(res);
    if (!res.ok) {
      setMsg(data?.error || rawText.slice(0, 200) || "Falha ao criar cliente.");
      return;
    }
    if (Array.isArray(data?.grupos)) setGrupos(data.grupos);
    if (Array.isArray(data?.linhas)) setLinhas(data.linhas);
    else if (data?.linha) {
      setLinhas((prev) => [...prev, data.linha!].sort(compareRioLinhasByNomeFantasia));
    }
    setMsg(`Cliente «${nomeFantasia}» criado (Nº PDV = 1). Use «Vincular CA» quando quiser.`);
  }, [activeYm, monthClosed]);

  const renomearMarca = useCallback(
    async (grupoId: string, novoNome: string) => {
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/grupos/${grupoId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome }),
      });
      const { data } = await readJsonFromResponse<{ linhas?: RioLinha[]; grupos?: RioGrupo[] }>(res);
      if (!res.ok) return;
      if (Array.isArray(data?.grupos)) setGrupos(data!.grupos!);
      if (Array.isArray(data?.linhas)) setLinhas(data!.linhas!);
    },
    [activeYm],
  );

  const apagarMarcaVazia = useCallback(
    async (grupoId: string) => {
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/grupos/${grupoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const { data, rawText } = await readJsonFromResponse<{ linhas?: RioLinha[]; grupos?: RioGrupo[] }>(res);
      if (!res.ok) {
        setMsg(rawText.includes("409") ? "Existem clientes nesta MARCA." : rawText.slice(0, 200));
        return;
      }
      if (Array.isArray(data?.grupos)) setGrupos(data!.grupos!);
      if (Array.isArray(data?.linhas)) setLinhas(data!.linhas!);
      setMsg(null);
    },
    [activeYm],
  );

  const exportMonth = useCallback(async () => {
    if (linhas.length === 0) return;
    setExportingMonth(true);
    try {
      await downloadRioMonthStyledExcel({
        yearMonth: activeYm,
        grupos,
        linhas,
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao exportar o mês.");
    } finally {
      setExportingMonth(false);
    }
  }, [activeYm, grupos, linhas]);

  const createMonth = useCallback(async () => {
    const next = shiftYearMonth(activeYm, 1);
    const donor = activeYm;
    const clone = isRioTurnoverMonth(next);
    const nextExists = months.some((m) => m.yearMonth === next);

    if (nextExists) {
      setActiveYm(next);
      setMsg(
        `${formatYearMonthLabel(next)} já existe. Se estiver vazio, use «Copiar de ${formatYearMonthLabel(donor)}».`,
      );
      return;
    }

    if (
      clone &&
      !window.confirm(
        `Criar ${formatYearMonthLabel(next)} copiando todo o trabalho de ${formatYearMonthLabel(donor)} (MARCA, PDVs, vínculos CA) e fechar ${formatYearMonthLabel(donor)}?`,
      )
    ) {
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/rio-planilha/clientes/months", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth: next, cloneFromPrevious: clone }),
      });
      const { data, rawText } = await readJsonFromResponse<{
        error?: string;
        clonedFrom?: number;
        needsBatchedClone?: boolean;
        linhas?: RioLinha[];
        grupos?: RioGrupo[];
      }>(res);
      if (!res.ok) {
        setMsg(data?.error || rawText.slice(0, 200) || "Falha ao criar competência.");
        return;
      }
      await loadMonths();
      setActiveYm(next);

      if (clone && data?.needsBatchedClone) {
        const ok = await runCloneDonorBatched(next, true);
        if (!ok) return;
        setMsg(
          `${formatYearMonthLabel(next)} criado a partir de ${formatYearMonthLabel(donor)}. ${formatYearMonthLabel(donor)} foi fechado. Use «Virada do mês» (em lotes) para entradas/saídas na CA.`,
        );
        return;
      }

      if (Array.isArray(data?.linhas)) setLinhas(data.linhas);
      if (Array.isArray(data?.grupos)) setGrupos(data.grupos);
      setMsg(
        clone && data?.clonedFrom ?
          `${formatYearMonthLabel(next)} criado a partir de ${formatYearMonthLabel(data.clonedFrom)}.`
        : `Competência ${formatYearMonthLabel(next)} criada.`,
      );
    } finally {
      setSyncing(false);
    }
  }, [months, activeYm, loadMonths, runCloneDonorBatched]);

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-5">
      {linkModalLinha ?
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[min(560px,90vh)] w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Vincular «{linkModalLinha.nomeFantasia}» à Conta Azul
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Busque pelo nome ou CNPJ. Ao vincular, o <strong>nome fantasia</strong> da linha passa a ser o da
                  Conta Azul; e-mail e contratos vêm da CA.
                </p>
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400"
                onClick={() => {
                  setLinkModalLinha(null);
                  setBuscaCa("");
                  setLinkHitFeedback({});
                }}
              >
                Fechar
              </button>
            </div>
            <div className="space-y-2 p-4">
              <input
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                placeholder="Nome ou CNPJ — só clientes ativos na CA…"
                value={buscaCa}
                autoFocus
                disabled={caLinkBusy}
                onChange={(e) => setBuscaCa(e.target.value)}
              />
              {linkModalNotice ?
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  {linkModalNotice}
                </p>
              : null}
              <div className="max-h-[min(360px,50vh)] space-y-2 overflow-y-auto">
                {hitsCa.length === 0 && buscaCa.trim().length >= 2 && !linkModalNotice ?
                  <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhum cliente ativo encontrado na Conta Azul para esta busca.
                  </p>
                : null}
                {hitsCa.map((h) => {
                  const fb = linkHitFeedback[h.id];
                  const busy = fb?.status === "busy";
                  return (
                    <div
                      key={h.id}
                      className={`rounded-lg border px-2 py-2 ${
                        fb?.status === "error" ?
                          "border-rose-300 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/30"
                        : fb?.status === "ok" ?
                          "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30"
                        : "border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950/40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{h.nome}</p>
                          {h.documento ?
                            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {displayBrazilianTaxId(h.documento)}
                            </p>
                          : null}
                          <p className="mt-0.5 font-mono text-[10px] text-slate-400">ID CA: {h.id}</p>
                        </div>
                        <button
                          type="button"
                          disabled={caLinkBusy || busy}
                          className="shrink-0 rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                          onClick={() => void onLinkCaHit(h)}
                        >
                          {busy ? "…" : "Vincular"}
                        </button>
                      </div>
                      {fb && fb.status !== "busy" ?
                        <p
                          className={`mt-1.5 text-xs leading-snug ${
                            fb.status === "error" ?
                              "text-rose-900 dark:text-rose-200"
                            : "text-emerald-900 dark:text-emerald-200"
                          }`}
                        >
                          {fb.message}
                        </p>
                      : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      : null}

      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Planilha Rio — clientes ativos Conta Azul
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Competência</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={activeYm}
              onChange={(e) => setActiveYm(Number(e.target.value))}
            >
              {months.length === 0 ?
                <option value={activeYm}>{formatYearMonthLabel(activeYm)}</option>
              : months.map((m) => (
                  <option key={m.id} value={m.yearMonth}>
                    {formatYearMonthLabel(m.yearMonth)}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className={
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors " +
              (rioConfigOpen ?
                "border-slate-400 bg-slate-100 text-slate-800 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100"
              : "border-amber-700 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/60")
            }
            aria-expanded={rioConfigOpen}
            onClick={() => setRioConfigOpen((v) => !v)}
          >
            {rioConfigOpen ? "▲ Ocultar configuração" : "⚙ Configuração da planilha"}
          </button>
        </div>
      </header>

      <PortalNoticeBanner
        notice={notice}
        clashNavLinhaId={clashNavLinhaId}
        onGoToClashLine={scrollToRioLinha}
      />

      {rioConfigOpen ?
        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div>
            <Link
              href={COBRANCA_HOME_HREF}
              className="text-[11px] font-semibold text-sky-600 underline-offset-4 hover:underline dark:text-sky-400"
            >
              ← Vencidos
            </Link>
            <p className="mt-2 max-w-[52rem] text-sm text-slate-600 dark:text-slate-400">
              Cada competência guarda clientes por <strong>importar CSV/Excel</strong> (export Conta Azul) ou{" "}
              <strong>sincronizar Conta Azul</strong>. Use <strong>Vincular CA</strong> (ou «Casar por CNPJ») para a
              planilha seguir o cadastro CA como fonte única de e-mail e dados. Organize por <strong>MARCA</strong> («Nova
              MARCA» + coluna «Marca bloco»). PDVs ao expandir o cliente.
            </p>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
              {monthInfo?.lastSyncedAt ?
                <>Última virada/sync: {new Date(monthInfo.lastSyncedAt).toLocaleString("pt-BR")}</>
              : <>Ainda sem virada do mês nesta competência.</>}
              {monthInfo?.closedAt ?
                <> · <strong className="text-amber-800 dark:text-amber-300">Mês fechado</strong></>
              : null}
            </p>
          </div>

      {monthClosed ?
        <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
          Competência <strong>fechada</strong> (somente consulta). Crie o mês seguinte para continuar a editar.
        </div>
      : null}

      {singleMonthInBase && !monthClosed ?
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Só há <strong>{formatYearMonthLabel(activeYm)}</strong> na base — não existe mês anterior para repor o sync de
          27/05. Use <strong>Remover inativos do sync</strong> para tirar clientes inativos da Conta Azul; MARCAs
          apagadas no sync precisam ser recriadas ou importadas de CSV/Excel.
        </div>
      : null}

      {turnoverMonth && !monthClosed ?
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          A partir desta competência: <strong>Novo mês seguinte</strong> copia a competência que está a ver (ex. maio →
          junho).           Se junho ficou vazio, use <strong>Copiar de {formatYearMonthLabel(donorYearMonthFor(activeYm))}</strong> (lotes
          de {RIO_CLONE_DONOR_BATCH_SIZE}). Depois <strong>Virada do mês</strong> compara com a CA em páginas e lotes de{" "}
          {RIO_VIRADA_LINHAS_BATCH} (evita
          timeout). Maio e anteriores mantêm o fluxo antigo.
        </div>
      : null}

      {caServerConnected === false ?
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40">
          <strong>Conta Azul desconectada.</strong> Vincular e atualizar e-mails exige OAuth no{" "}
          <Link href={COBRANCA_HOME_HREF} className="font-semibold underline">
            vencidos
          </Link>
          .
        </div>
      : null}

      {!loading && linhas.length > 0 && grupoOrd.length === 0 ?
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          Ainda não há blocos <strong>MARCA</strong> nesta competência. Clique em{" "}
          <strong>Nova MARCA</strong> ou importe a coluna <code className="text-xs">grupo</code> /{" "}
          <code className="text-xs">grupo_site</code> no CSV — depois atribua cada cliente na coluna «Marca bloco».
        </div>
      : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-2">
        <label className="flex max-w-md cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={syncIncludePersonDetails}
            onChange={(e) => setSyncIncludePersonDetails(e.target.checked)}
          />
          <span>
            <strong>Enriquecer cadastro</strong> na CA (e-mail, razão, etc.) — após a listagem, atualiza{" "}
            <strong>{RIO_CA_REFRESH_BATCH_SIZE} clientes por vez</strong> (igual «Atualizar vinculados»).
          </span>
        </label>
        <label className="flex max-w-md cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={syncIncludeContracts}
            onChange={(e) => setSyncIncludeContracts(e.target.checked)}
          />
          <span>
            Atualizar <strong>números de contrato</strong> na CA — lotes de{" "}
            <strong>{RIO_CA_REFRESH_BATCH_SIZE_WITH_CONTRACTS}</strong> (mais lento por cliente; evita timeout).
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-emerald-800 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          disabled={exportingMonth || linhas.length === 0}
          title="Excel formatado com cores da planilha (MARCA, totais, categorias)"
          onClick={() => void exportMonth()}
        >
          {exportingMonth ? "Exportando…" : "Exportar mês"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={() => void ensureMonthShell()}
        >
          Garantir mês na base
        </button>
        {turnoverMonth && !monthClosed ?
          <button
            type="button"
            className="rounded-lg border border-sky-700 bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-950 hover:bg-sky-200 disabled:opacity-50 dark:border-sky-600 dark:bg-sky-950/60 dark:text-sky-100"
            disabled={syncing}
            title={`Repor MARCA, clientes e PDVs de ${formatYearMonthLabel(donorYearMonthFor(activeYm))}`}
            onClick={() => void cloneFromDonorMonth()}
          >
            Copiar de {formatYearMonthLabel(donorYearMonthFor(activeYm))}
          </button>
        : null}
        <button
          type="button"
          className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          disabled={syncing || monthClosed}
          onClick={() => void syncCa()}
        >
          {syncing ?
            turnoverMonth ?
              "Virada do mês…"
            : "Sincronizando…"
          : turnoverMonth ?
            "Virada do mês"
          : "Sincronizar Conta Azul"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-rose-700 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-950 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-600 dark:bg-rose-950/50 dark:text-rose-100 dark:hover:bg-rose-900/60"
          disabled={syncing || revertingSync || monthClosed}
          title="Remove importações do último sync ou restaura backup se existir"
          onClick={() => void revertLastSync()}
        >
          {revertingSync ?
            "A limpar…"
          : singleMonthInBase ?
            "Remover inativos do sync"
          : "Desfazer último sync"}
        </button>
        <input
          ref={fileImportRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void runImportFile(f);
          }}
        />
        <button
          type="button"
          className="rounded-lg border border-amber-700 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/60"
          disabled={importing}
          onClick={() => fileImportRef.current?.click()}
        >
          {importing ? "A importar…" : "Importar CSV / Excel"}
        </button>
        <input
          ref={fileMarcaLayoutRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void runMarcaLayoutImport(f);
          }}
        />
        <button
          type="button"
          title="CSV/Excel exportado com colunas A MARCA, B nº PDV, C nome, H categoria (sem usar CNPJ nem valor)."
          className="rounded-lg border border-violet-700 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-50 dark:hover:bg-violet-900/55"
          disabled={importing}
          onClick={() => fileMarcaLayoutRef.current?.click()}
        >
          MARCA + PDVs (planilha interna)
        </button>
        <a
          href="/planilha-rio-import-exemplo.csv"
          download
          className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Modelo CSV
        </a>
        <button
          type="button"
          className="rounded-lg border border-emerald-900/71 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-50 dark:hover:bg-emerald-900/71"
          onClick={() => void criarMarca()}
        >
          Nova MARCA
        </button>
        <button
          type="button"
          disabled={monthClosed}
          title={monthClosed ? "Mês fechado" : "Linha manual; depois vincule à Conta Azul"}
          className="rounded-lg border border-teal-800 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-950 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-600 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-900/60"
          onClick={() => void criarCliente()}
        >
          Novo cliente
        </button>
        <button
          type="button"
          disabled={refreshingCa || linhas.length === 0}
          className="rounded-lg border border-sky-700 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-100"
          onClick={() => void refreshLinkedFromCa(false)}
          title={`Atualiza linhas vinculadas — ${RIO_CA_REFRESH_BATCH_SIZE} (ou ${RIO_CA_REFRESH_BATCH_SIZE_WITH_CONTRACTS} com Contratos) por vez`}
        >
          {refreshingCa ? "Atualizando CA…" : "Atualizar vinculados CA"}
        </button>
        <button
          type="button"
          disabled={refreshingCa || linhas.length === 0}
          className="rounded-lg border border-violet-700 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-100"
          onClick={() => void refreshLinkedFromCa(true)}
          title="Casa CNPJ/CPF e depois atualiza vinculados — 10 clientes por lote"
        >
          Casar CNPJ → CA
        </button>
        <button
          type="button"
          className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-500 dark:text-slate-300"
          onClick={() => void createMonth()}
        >
          Novo mês seguinte (+1)
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex max-w-xl cursor-pointer items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={importInferMovement}
            onChange={(e) => setImportInferMovement(e.target.checked)}
          />
          <span>
            Ao importar CSV/Excel (ex.: export Cliente da Conta Azul), marcar <strong>entrada</strong>/
            <strong>saida</strong> usando o snapshot do <strong>mês civil anterior</strong> já gravado aqui —
            recomendado para voltar a importar todos os meses.
          </span>
        </label>
      </div>
        </div>
      : null}

      {!loading && linhas.length > 0 ?
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Totais — {formatYearMonthLabel(activeYm)}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-slate-800 dark:text-slate-100">
            <span>
              <span className="text-slate-500 dark:text-slate-400">Pontos ativos (Nº PDV):</span>{" "}
              <strong className="tabular-nums">{monthTotals.pdvTotal}</strong>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400">Valor mês:</span>{" "}
              <strong className="tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatRioValorTotal(monthTotals.valorHasAny, monthTotals.valorTotal)}
              </strong>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {monthTotals.clientesAtivos} cliente{monthTotals.clientesAtivos === 1 ? "" : "s"} ativo
              {monthTotals.clientesAtivos === 1 ? "" : "s"} (sem saída)
            </span>
          </div>
        </div>
      : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="max-h-[min(72vh,calc(100dvh-12rem))] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <table className="min-w-[1240px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <th className="sticky left-0 top-0 z-[3] w-16 border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                ⇅ / ⧉
              </th>
              <th className="sticky top-0 z-[2] border-b border-l border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Marca bloco
              </th>
              <th className="sticky top-0 z-[2] border-b border-l border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Cliente
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                CNPJ
              </th>
              <th className="sticky top-0 z-[2] border-b border-l border-slate-200 bg-slate-50 px-1 py-1 text-center shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Mov.
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 text-center shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Contrato
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Valor
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Nº PDV
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Categoria
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Vínculo CA
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                E-mail cobrança
              </th>
              <th className="sticky top-0 z-[2] border-b border-slate-200 bg-slate-50 px-1 py-1 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-800 dark:bg-slate-900">
                Razão social
              </th>
            </tr>
          </thead>
          {loading ?
            <tbody>
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-sm text-slate-500">
                  Carregando…
                </td>
              </tr>
            </tbody>
          : linhas.length === 0 ?
            <tbody>
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-sm text-slate-500">
                  Nenhuma linha. Use <strong>Importar CSV / Excel</strong> ou <strong>Sincronizar Conta Azul</strong>.
                  Depois crie MARCA («Nova MARCA») e distribua os clientes.
                </td>
              </tr>
            </tbody>
          : (
            <>
              {systemGrupoOrd.map((g) =>
                g.systemTag === "pdv_entrada" || g.systemTag === "pdv_saida" ?
                  <PdvMovimentoMarcaBlock
                    key={g.id}
                    tag={g.systemTag as "pdv_entrada" | "pdv_saida"}
                    titulo={g.nome}
                    linhas={linhas}
                  />
                : <ClienteMarcaBlock
                    key={g.id}
                    ym={activeYm}
                    marca={g}
                    gruposTodos={grupoOrd}
                    linhasOrdered={buckets.get(g.id) ?? []}
                    onReorderLinhasSameMarca={(a, o) => void reorderMesmaMarca(g.id, a, o)}
                    onMoveMarca={(lid, nid) => void moveLinhaEntreMarcas(lid, nid)}
                    onRenameMarca={() => {}}
                    onDeleteMarca={() => {}}
                    onShiftMarca={() => {}}
                    onOpenCaLink={onOpenCaLink}
                    onToggleCaLink={onToggleCaLink}
                    onAddPdvsBulk={addPdvsBulk}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    patchLinha={patchLinha}
                    setLinhas={setLinhas}
                    addPdv={addPdv}
                    patchPdv={patchPdv}
                  delPdv={delPdv}
                  onDeleteLinha={(row) => void delLinha(row)}
                  monthClosed={monthClosed}
                  newPdvName={newPdvName}
                  setNewPdvName={setNewPdvName}
                />,
              )}
              {userGrupoOrd.map((g, ix) => (
                <ClienteMarcaBlock
                  key={g.id}
                  ym={activeYm}
                  marca={g}
                  grupoIndex={ix}
                  grupoCount={userGrupoOrd.length}
                  gruposTodos={grupoOrd}
                  linhasOrdered={buckets.get(g.id) ?? []}
                  onReorderLinhasSameMarca={(a, o) => void reorderMesmaMarca(g.id, a, o)}
                  onMoveMarca={(lid, nid) => void moveLinhaEntreMarcas(lid, nid)}
                  onRenameMarca={(gid, nome) => void renomearMarca(gid, nome.trim())}
                  onDeleteMarca={(gid) => void apagarMarcaVazia(gid)}
                  onShiftMarca={(i, d) => void deslocarBlocoMarca(i, d)}
                  onOpenCaLink={onOpenCaLink}
                  onToggleCaLink={onToggleCaLink}
                  onAddPdvsBulk={addPdvsBulk}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  patchLinha={patchLinha}
                  setLinhas={setLinhas}
                  addPdv={addPdv}
                  patchPdv={patchPdv}
                  delPdv={delPdv}
                  onDeleteLinha={(row) => void delLinha(row)}
                  monthClosed={monthClosed}
                  newPdvName={newPdvName}
                  setNewPdvName={setNewPdvName}
                />
              ))}
              {orphans.length ?
                <ClienteMarcaBlock
                  key="__sem_marca__"
                  ym={activeYm}
                  marca={null}
                  gruposTodos={grupoOrd}
                  linhasOrdered={orphans}
                  grupoIndex={null}
                  grupoCount={0}
                  onReorderLinhasSameMarca={(a, o) => void reorderMesmaMarca(null, a, o)}
                  onMoveMarca={(lid, nid) => void moveLinhaEntreMarcas(lid, nid)}
                  onRenameMarca={() => {}}
                  onDeleteMarca={() => {}}
                  onShiftMarca={() => {}}
                  onOpenCaLink={onOpenCaLink}
                  onToggleCaLink={onToggleCaLink}
                  onAddPdvsBulk={addPdvsBulk}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  patchLinha={patchLinha}
                  setLinhas={setLinhas}
                  addPdv={addPdv}
                  patchPdv={patchPdv}
                  delPdv={delPdv}
                  onDeleteLinha={(row) => void delLinha(row)}
                  monthClosed={monthClosed}
                  newPdvName={newPdvName}
                  setNewPdvName={setNewPdvName}
                />
              : null}
            </>
          )}
        </table>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-500">
        {COMPANY_NAME} — dados Conta Azul sob credenciais OAuth deste portal.
      </p>
    </div>
  );
}
