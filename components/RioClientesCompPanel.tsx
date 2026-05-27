"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RIO_CA_REFRESH_BATCH_SIZE } from "@/lib/rio/rioCaPersonLink";
import * as XLSX from "xlsx";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMPANY_NAME } from "@/lib/brand";
import {
  ClienteMarcaBlock,
  type RioGrupoCb,
  type RioLinhaCb,
} from "@/components/rio/ClienteMarcaBlock";
import { PdvNomePoolColumn } from "@/components/rio/PdvNomePoolColumn";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/manualReminders/yearMonth";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { readJsonFromResponse } from "@/lib/safeHttpJson";
import { arrayMove } from "@dnd-kit/sortable";

type MonthMeta = { id: string; yearMonth: number };

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

  map.forEach((arr) =>
    arr.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR", { sensitivity: "base" }),
    ),
  );
  orphans.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR", { sensitivity: "base" }),
  );
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
  const [monthInfo, setMonthInfo] = useState<{ lastSyncedAt: string | null } | null>(null);
  const [linhas, setLinhas] = useState<RioLinha[]>([]);
  const [grupos, setGrupos] = useState<RioGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
  const [caLinkBusy, setCaLinkBusy] = useState(false);
  const [refreshingCa, setRefreshingCa] = useState(false);
  const [pdvPoolText, setPdvPoolText] = useState("");

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
        month?: { lastSyncedAt?: string } | null;
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
        data?.month ? { lastSyncedAt: data.month.lastSyncedAt ?? null } : { lastSyncedAt: null },
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

  const syncCa = useCallback(async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeContracts: syncIncludeContracts,
          includePersonDetails: syncIncludePersonDetails,
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
      setMonthInfo((m) => ({ lastSyncedAt: new Date().toISOString() }));
      const n = data?.count ?? data?.linhas?.length ?? 0;
      const listed = data?.caPersonListingCount;
      const listedHint =
        typeof listed === "number" ?
          ` (${listed} registros «Cliente» na listagem CA${listed === 0 ? " — nada retornado pela API neste critério" : ""})`
        : "";
      const contrHint =
        data?.syncedContractsFromCa ?
          " Contratos CA atualizados nesta sync."
        : " Contratos: mantidos do que já estava na competência (sync sem busca em /contratos).";
      const detailHint =
        data?.syncedPersonDetailsFromCa ?
          " Dados extra (e-mail cobrança, etc.) atualizados via API de pessoas."
        : " E-mail/razão/valor: só listagem básica nesta sync (sem enriquecimento por ID).";
      setMsg(`Sincronizado: ${n} linhas.${listedHint}${contrHint}${detailHint}`);
      await loadMonths();
    } catch {
      setMsg("Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  }, [activeYm, syncIncludeContracts, syncIncludePersonDetails, loadMonths]);

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
        setMonthInfo((m) => ({ lastSyncedAt: new Date().toISOString() }));
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
    async (linhaId: string, names: string[]) => {
      if (!names.length) return;
      const res = await fetch(
        `/api/rio-planilha/clientes/month/${activeYm}/linha/${encodeURIComponent(linhaId)}/pdvs/bulk`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names }),
        },
      );
      const { data, rawText } = await readJsonFromResponse<{
        pdvs?: RioPdv[];
        createdCount?: number;
        skippedCount?: number;
        numeroPdvSite?: number;
        valorClienteTexto?: string;
        error?: string;
      }>(res);
      if (!res.ok) {
        setMsg(data?.error || rawText.slice(0, 200) || "Falha ao adicionar PDVs.");
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
      const skipped = data?.skippedCount ?? 0;
      setMsg(
        created || skipped ?
          `PDVs em «${linhas.find((l) => l.id === linhaId)?.nomeFantasia ?? "cliente"}»: +${created}${skipped ? ` (${skipped} ignorados — já existiam)` : ""}.`
        : "Nenhum PDV novo.",
      );
    },
    [activeYm, linhas],
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
      const { data } = await readJsonFromResponse<{
        pdv?: RioPdv;
        numeroPdvSite?: number;
        valorClienteTexto?: string;
      }>(res);
      if (!res.ok || !data?.pdv) return;
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
    [activeYm, newPdvName],
  );

  const patchPdv = useCallback(async (pdvId: string, nome: string) => {
    const res = await fetch(`/api/rio-planilha/clientes/pdv/${pdvId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const { data } = await readJsonFromResponse<{ pdv?: RioPdv }>(res);
    if (!res.ok || !data?.pdv) return;
    setLinhas((prev) =>
      prev.map((ln) => ({
        ...ln,
        pdvs: sortRioPdvsByNome(
          ln.pdvs.map((p) => (p.id === pdvId ? { ...p, nome: data.pdv!.nome } : p)),
        ),
      })),
    );
  }, []);

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

  const grupoOrd = useMemo(
    () => [...grupos].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [grupos],
  );

  const { map: buckets, orphans } = useMemo(() => bucketize(grupoOrd, linhas), [grupoOrd, linhas]);

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
      const ids = grupoOrd.map((g) => g.id);
      const j = ix + delta;
      if (j < 0 || j >= ids.length) return;
      const nextIds = arrayMove(ids, ix, j);
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
    [activeYm, grupoOrd],
  );

  const postRefreshCaLinha = useCallback(
    async (linhaId: string, body: Record<string, unknown>) => {
      setCaLinkBusy(true);
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
          linha?: RioLinha;
        }>(res);
        if (data?.connected === false && data.message) {
          setMsg(data.message);
          return false;
        }
        if (!res.ok) {
          const err =
            data?.error === "ca_person_already_linked" ?
              `Esta pessoa CA já está noutra linha deste mês${data.detail ? `: ${data.detail}` : ""}.`
            : (data?.error || rawText).slice(0, 240);
          setMsg(err || "Falha ao vincular.");
          return false;
        }
        const hints = [data?.billingEmailsEmptyHint, data?.contractValorEmptyHint].filter(
          (h): h is string => Boolean(h),
        );
        if (hints.length) setMsg(hints.join(" "));
        else setMsg(null);
        if (data?.linha) {
          setLinhas((prev) =>
            prev.map((x) =>
              x.id === linhaId ? { ...data.linha!, pdvs: data.linha!.pdvs ?? x.pdvs } : x,
            ),
          );
        }
        return true;
      } finally {
        setCaLinkBusy(false);
      }
    },
    [activeYm],
  );

  const onOpenCaLink = useCallback((r: RioLinha) => {
    setBuscaCa(r.documento?.replace(/\D/g, "").slice(0, 14) || r.nomeFantasia.split(" ").slice(0, 4).join(" "));
    setLinkModalNotice(null);
    setLinkModalLinha(r);
  }, []);

  const onToggleCaLink = useCallback(
    async (r: RioLinha) => {
      if (!window.confirm(`Desvincular «${r.nomeFantasia}» da Conta Azul nesta competência?`)) return;
      const ok = await postRefreshCaLinha(r.id, { personId: "" });
      if (ok) setMsg("Vínculo CA removido nesta linha.");
    },
    [postRefreshCaLinha],
  );

  const onSelectCaHit = useCallback(
    async (hit: { id: string; nome: string }) => {
      if (!linkModalLinha) return;
      const ok = await postRefreshCaLinha(linkModalLinha.id, { personId: hit.id });
      if (ok) {
        setLinkModalLinha(null);
        setBuscaCa("");
        setMsg(`Vinculado a «${hit.nome}» — e-mail e dados vêm da Conta Azul.`);
      }
    },
    [linkModalLinha, postRefreshCaLinha],
  );

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
    ) => {
      let offset = 0;
      const limit = RIO_CA_REFRESH_BATCH_SIZE;

      while (true) {
        if (caRefreshRunId.current !== runId) return;

        const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/refresh-linked-ca`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit, mode }),
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
          throw new Error(
            data?.message || data?.error || rawText.slice(0, 220) || "Falha ao atualizar vínculos.",
          );
        }

        if (Array.isArray(data?.updatedLinhas)) mergeLinhasFromCaBatch(data.updatedLinhas);

        const p = data?.progress;
        if (p) {
          const label =
            mode === "match" ? "Casar CNPJ → CA" : "Atualizar vinculados CA";
          if (p.globalTotal === 0) {
            setMsg(
              mode === "match" ?
                "Nenhuma linha com CNPJ/CPF para casar neste lote."
              : "Nenhum cliente vinculado à CA para atualizar.",
            );
            return;
          }
          setMsg(
            `${label} — ação ${p.batchNumber} de ${p.batchCount}: clientes ${p.batchFrom}–${p.batchTo} de ${p.globalTotal}…`,
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

  const refreshLinkedFromCa = useCallback(
    async (matchByDocument: boolean) => {
      const runId = ++caRefreshRunId.current;
      setRefreshingCa(true);
      setMsg(null);
      const acc = { updated: 0, failed: 0, matched: 0, ambiguous: 0, notFound: 0 };

      try {
        if (matchByDocument) {
          await runCaBatchPhase("match", runId, acc);
          if (caRefreshRunId.current !== runId) return;
        }
        await runCaBatchPhase("refresh", runId, acc);
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
    [runCaBatchPhase],
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

  const exportExcel = useCallback(() => {
    const head = [
      "MARCA (bloco Rio)",
      "Grupo texto (CSV)",
      "Cliente",
      "CNPJ",
      "Movimento",
      "Contratos ativos",
      "Valor (CA)",
      "Nº PDVs (site)",
      "Categoria",
      "E-mail cobrança",
      "Razão social",
      "PDVs (lista)",
    ];
    const rows = linhas.map((r) => [
      r.grupo?.nome ?? "",
      r.grupoSite,
      r.nomeFantasia,
      r.documento ?? "",
      r.movimento,
      r.contratosAtivosTexto,
      r.valorClienteTexto,
      String(r.numeroPdvSite),
      r.categoriaSite,
      r.emailCobranca ?? "",
      r.razaoSocial,
      r.pdvs.map((p) => p.nome).join(" | "),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rio");
    XLSX.writeFile(wb, `planilha-rio-${activeYm}.xlsx`);
  }, [linhas, activeYm]);

  const createMonth = useCallback(async () => {
    const base = months.length > 0 ? months[0].yearMonth : activeYm;
    const next = shiftYearMonth(base, 1);
    const res = await fetch("/api/rio-planilha/clientes/months", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: next }),
    });
    if (!res.ok) {
      const { data } = await readJsonFromResponse<{ error?: string }>(res);
      setMsg(data?.error || "Falha ao criar competência.");
      return;
    }
    await loadMonths();
    setActiveYm(next);
  }, [months, activeYm, loadMonths]);

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
                  Busque pelo nome ou CNPJ. O e-mail de cobrança passa a vir só da CA.
                </p>
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400"
                onClick={() => {
                  setLinkModalLinha(null);
                  setBuscaCa("");
                }}
              >
                Fechar
              </button>
            </div>
            <div className="space-y-2 p-4">
              <input
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                placeholder="Nome ou CNPJ (só números)…"
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
              <div className="max-h-[min(360px,50vh)] space-y-1 overflow-y-auto">
                {hitsCa.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={caLinkBusy}
                    className="w-full rounded border border-transparent px-2 py-2 text-left text-sm hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                    onClick={() => void onSelectCaHit(h)}
                  >
                    <span className="font-medium">{h.nome}</span>
                    {h.documento ?
                      <span className="ml-2 text-xs text-slate-500">{h.documento}</span>
                    : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      : null}

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="text-[11px] font-semibold text-sky-600 underline-offset-4 hover:underline dark:text-sky-400"
          >
            ← Painel principal
          </Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Planilha Rio — clientes ativos Conta Azul
          </h1>
          <p className="mt-1 max-w-[52rem] text-sm text-slate-600 dark:text-slate-400">
            Cada competência guarda clientes por <strong>importar CSV/Excel</strong> (export Conta Azul) ou{" "}
            <strong>sincronizar Conta Azul</strong>. Use <strong>Vincular CA</strong> (ou «Casar por CNPJ») para a
            planilha seguir o cadastro CA como fonte única de e-mail e dados. Organize por <strong>MARCA</strong> («Nova
            MARCA» + coluna «Marca bloco»). PDVs amarelos ao expandir o cliente.
          </p>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
            {monthInfo?.lastSyncedAt ?
              <>Última sincronização: {new Date(monthInfo.lastSyncedAt).toLocaleString("pt-BR")}</>
            : <>Ainda não sincronizado nesta competência.</>}
          </p>
        </div>
        <ThemeToggle />
      </header>

      {msg ?
        <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {msg}
        </div>
      : null}

      {caServerConnected === false ?
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40">
          <strong>Conta Azul desconectada.</strong> Vincular e atualizar e-mails exige OAuth no{" "}
          <Link href="/" className="font-semibold underline">
            painel principal
          </Link>
          .
        </div>
      : null}

      {!loading && linhas.length > 0 && grupoOrd.length === 0 ?
        <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          Ainda não há blocos <strong>MARCA</strong> nesta competência. Clique em{" "}
          <strong>Nova MARCA</strong> ou importe a coluna <code className="text-xs">grupo</code> /{" "}
          <code className="text-xs">grupo_site</code> no CSV — depois atribua cada cliente na coluna «Marca bloco».
        </div>
      : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-2">
        <label className="flex max-w-md cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={syncIncludePersonDetails}
            onChange={(e) => setSyncIncludePersonDetails(e.target.checked)}
          />
          <span>
            <strong>Enriquecer cadastro</strong> na CA (e-mail cobrança, razão social quando a API trouxer,
            etc.) — faz muitas chamadas <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">/v1/pessoas</code>;{" "}
            <em>sem isto</em> a sync usa só a listagem (mais rápida; e-mail fica vazio na 1.ª vez ou repete o que já
            estava nesta competência).
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
            Atualizar <strong>números de contrato</strong> na Conta Azul (muito mais lento; pode dar{" "}
            <em>timeout</em> no Netlify com muitos clientes).
          </span>
        </label>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
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
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={() => void ensureMonthShell()}
        >
          Garantir mês na base
        </button>
        <button
          type="button"
          className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          disabled={syncing}
          onClick={() => void syncCa()}
        >
          {syncing ? "Sincronizando…" : "Sincronizar Conta Azul"}
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
          disabled={refreshingCa || linhas.length === 0}
          className="rounded-lg border border-sky-700 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-100"
          onClick={() => void refreshLinkedFromCa(false)}
          title="Atualiza e-mail, contrato e valor das linhas vinculadas — 10 clientes por vez em segundo plano"
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
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          onClick={() => void exportExcel()}
        >
          Exportar Excel
        </button>
        <button
          type="button"
          className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-500 dark:text-slate-300"
          onClick={() => void createMonth()}
        >
          Novo mês seguinte (+1)
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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

      <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
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
              {grupoOrd.map((g, ix) => (
                <ClienteMarcaBlock
                  key={g.id}
                  ym={activeYm}
                  marca={g}
                  grupoIndex={ix}
                  grupoCount={grupoOrd.length}
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
                  newPdvName={newPdvName}
                  setNewPdvName={setNewPdvName}
                />
              : null}
            </>
          )}
        </table>
        </div>
      </div>
      {linhas.length > 0 ?
        <PdvNomePoolColumn text={pdvPoolText} onTextChange={setPdvPoolText} />
      : null}
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-500">
        {COMPANY_NAME} — dados Conta Azul sob credenciais OAuth deste portal.
      </p>
    </div>
  );
}
