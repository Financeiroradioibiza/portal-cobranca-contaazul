"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  buildProducaoTree,
  grupoIconStyle,
  treeStats,
  type PainelLinkBrief,
  type ProducaoGrupoNode,
  type RioMonthBundle,
} from "@/lib/cadastros/rioProducaoTree";
import {
  applyPdvPlacementOverrides,
  buildProducaoHierarchy,
  findSubClienteForRioLinha,
  mastersForRioSelection,
  prodPdvDragId,
  prodProgDropId,
  type PdvPlacementOverride,
  type ProducaoMasterNode,
  type ProducaoPdvRef,
  type ProducaoProgramaNode,
  type ProducaoSubClienteNode,
  type RioLinhaForProducao,
  type RioOrigemLayout,
} from "@/lib/cadastros/producaoHierarchy";
import { displayBrazilianTaxId } from "@/lib/format";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
} from "@/lib/manualReminders/yearMonth";
import { painelPdvEditUrl } from "@/lib/radioPainel/publicUrls";

type MonthMeta = { id: string; yearMonth: number };

type Suggestion = {
  painelPdvId: number;
  painelClienteId: number;
  painelPdvNome: string;
  painelClienteNome: string;
  matchMethod: string;
  score: number;
  label: string;
};

type RioSel =
  | { tipo: "marca"; grupoId: string; marcaNome: string }
  | { tipo: "cliente"; rioLinhaId: string; grupoId: string }
  | { tipo: "pdv"; rioLinhaId: string; rioPdvId: string }
  | null;

function overridesStorageKey(ym: number) {
  return `cadastros-producao-overrides-${ym}`;
}

function origemBadge(origem: RioOrigemLayout): { label: string; className: string } {
  if (origem === "marca") {
    return {
      label: "Rio · marca",
      className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
    };
  }
  if (origem === "sem_marca") {
    return {
      label: "Rio · sem marca",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    };
  }
  return {
    label: "Rio · cliente",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  };
}

function DraggableProdPdv({
  pdv,
  selected,
  onSelect,
}: {
  pdv: ProducaoPdvRef;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: prodPdvDragId(pdv.rioPdvId),
    data: { pdv },
  });
  const linked = Boolean(pdv.painelLink);

  return (
    <div
      ref={setNodeRef}
      className={
        "mb-1 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-opacity " +
        (selected ?
          "border-[#C4146A] bg-pink-50 dark:border-pink-500 dark:bg-pink-950/30"
        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900") +
        (isDragging ? " opacity-40" : "")
      }
    >
      <button
        type="button"
        className="cursor-grab text-slate-400 active:cursor-grabbing"
        aria-label="Arrastar PDV"
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="font-medium text-slate-800 dark:text-slate-100">{pdv.nome}</span>
        <span className="ml-1 text-[10px] text-slate-400">
          {linked ? `· painel #${pdv.painelLink!.painelPdvId}` : "· sem painel"}
        </span>
      </button>
    </div>
  );
}

function ProgramaDropZone({
  sub,
  programa,
  children,
}: {
  sub: ProducaoSubClienteNode;
  programa: ProducaoProgramaNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: prodProgDropId(sub.key, programa.id),
    data: { subKey: sub.key, programaId: programa.id },
  });
  return (
    <div
      ref={setNodeRef}
      className={
        "ml-4 rounded-md border border-dashed p-2 transition-colors " +
        (isOver ?
          "border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/30"
        : "border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30")
      }
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px]">🎵</span>
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {programa.nome}
        </span>
        <span className="text-[10px] text-slate-400">{programa.pdvs.length} PDV</span>
      </div>
      {children}
    </div>
  );
}

export function CadastrosGruposPanel() {
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState(todayYm);
  const [rioGrupos, setRioGrupos] = useState<ProducaoGrupoNode[]>([]);
  const [mastersBase, setMastersBase] = useState<ProducaoMasterNode[]>([]);
  const [overrides, setOverrides] = useState<PdvPlacementOverride[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [rioExpanded, setRioExpanded] = useState<Set<string>>(new Set());
  const [rioClienteOpen, setRioClienteOpen] = useState<Set<string>>(new Set());
  const [prodExpanded, setProdExpanded] = useState<Set<string>>(new Set());
  const [rioSel, setRioSel] = useState<RioSel>(null);
  const [selProdPdvId, setSelProdPdvId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dragPdv, setDragPdv] = useState<ProducaoPdvRef | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const masters = useMemo(
    () => applyPdvPlacementOverrides(mastersBase, overrides),
    [mastersBase, overrides],
  );

  const mastersFiltered = useMemo(() => {
    if (!rioSel) return masters;
    if (rioSel.tipo === "marca") {
      return mastersForRioSelection(masters, { tipo: "marca", marcaNome: rioSel.marcaNome });
    }
    return mastersForRioSelection(masters, { tipo: "cliente", rioLinhaId: rioSel.rioLinhaId });
  }, [masters, rioSel]);

  const rioStats = useMemo(() => treeStats(rioGrupos), [rioGrupos]);

  const loadAll = useCallback(async (ym: number) => {
    setBusy(true);
    setMsg("");
    try {
      const stored = localStorage.getItem(overridesStorageKey(ym));
      if (stored) {
        try {
          setOverrides(JSON.parse(stored) as PdvPlacementOverride[]);
        } catch {
          setOverrides([]);
        }
      } else {
        setOverrides([]);
      }

      const [mRes, vRes] = await Promise.all([
        fetch(`/api/rio-planilha/clientes/month/${ym}`),
        fetch(`/api/cadastros/month/${ym}/vinculos`),
      ]);
      const monthData = (await mRes.json()) as RioMonthBundle & { error?: string };
      const vincData = (await vRes.json()) as {
        ok?: boolean;
        rows?: Array<{
          rioPdvId: string;
          link: {
            painelPdvId: number;
            painelClienteId: number;
            painelPdvNome: string | null;
            matchMethod: string;
          } | null;
        }>;
        error?: string;
      };

      if (!mRes.ok) throw new Error(monthData.error ?? "month_erro");
      if (!vRes.ok || !vincData.ok) throw new Error(vincData.error ?? "vinculos_erro");

      const linkMap = new Map<string, PainelLinkBrief>();
      for (const row of vincData.rows ?? []) {
        if (!row.link) continue;
        linkMap.set(row.rioPdvId, {
          painelPdvId: row.link.painelPdvId,
          painelClienteId: row.link.painelClienteId,
          painelPdvNome: row.link.painelPdvNome,
          matchMethod: row.link.matchMethod,
        });
      }

      const rioTree = buildProducaoTree(
        { grupos: monthData.grupos ?? [], linhas: monthData.linhas ?? [] },
        linkMap,
      );
      setRioGrupos(rioTree);
      setRioExpanded(new Set(rioTree.map((g) => g.id)));

      const linhasForProd: RioLinhaForProducao[] = (monthData.linhas ?? []).map((ln) => {
        const g = monthData.grupos?.find((x) => x.id === ln.rioGrupoId);
        const semMarca = !ln.rioGrupoId;
        return {
          id: ln.id,
          nomeFantasia: ln.nomeFantasia,
          marcaNome: g?.nome ?? ln.grupo?.nome ?? null,
          semMarca,
          pdvs: ln.pdvs,
        };
      });

      const prod = buildProducaoHierarchy(linhasForProd, linkMap);
      setMastersBase(prod);
      setProdExpanded(new Set(prod.map((m) => m.key)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar.");
      setRioGrupos([]);
      setMastersBase([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/rio-planilha/clientes/months")
      .then((r) => r.json())
      .then((d: { months?: MonthMeta[] }) => {
        const list = d.months ?? [];
        setMonths(list);
        if (list.length && !list.some((m) => m.yearMonth === activeYm)) {
          setActiveYm(list.find((m) => m.yearMonth === todayYm)?.yearMonth ?? list[0]!.yearMonth);
        }
      })
      .catch(() => {});
  }, [activeYm, todayYm]);

  useEffect(() => {
    void loadAll(activeYm);
  }, [activeYm, loadAll]);

  useEffect(() => {
    localStorage.setItem(overridesStorageKey(activeYm), JSON.stringify(overrides));
  }, [overrides, activeYm]);

  const filteredRio = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rioGrupos;
    return rioGrupos
      .map((g) => {
        const clientes = g.clientes.filter((c) => {
          const blob = `${g.nome} ${c.nomeFantasia} ${c.pdvs.map((p) => p.nome).join(" ")}`.toLowerCase();
          return blob.includes(needle);
        });
        if (!clientes.length && !g.nome.toLowerCase().includes(needle)) return null;
        return { ...g, clientes };
      })
      .filter(Boolean) as ProducaoGrupoNode[];
  }, [rioGrupos, q]);

  async function loadSuggestions(rioPdvId: string) {
    try {
      const res = await fetch("/api/cadastros/pdv-link/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rioCompPdvId: rioPdvId }),
      });
      const data = (await res.json()) as { suggestions?: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
    } catch {
      setSuggestions([]);
    }
  }

  function selectRioCliente(grupoId: string, rioLinhaId: string) {
    setRioSel({ tipo: "cliente", rioLinhaId, grupoId });
    setSelProdPdvId(null);
    setSuggestions([]);
    const hit = findSubClienteForRioLinha(masters, rioLinhaId);
    if (hit) {
      setProdExpanded((prev) => new Set([...prev, hit.master.key, hit.sub.key]));
    }
  }

  async function savePainelLink(rioPdvId: string, s: Suggestion) {
    setBusy(true);
    try {
      const res = await fetch("/api/cadastros/pdv-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rioCompPdvId: rioPdvId,
          painelPdvId: s.painelPdvId,
          painelClienteId: s.painelClienteId,
          matchMethod: s.matchMethod,
          verified: true,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "save_erro");
      await loadAll(activeYm);
      setMsg("Vínculo com painel legado salvo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao vincular.");
    } finally {
      setBusy(false);
    }
  }

  function onDragStart(ev: DragStartEvent) {
    const pdv = ev.active.data.current?.pdv as ProducaoPdvRef | undefined;
    if (pdv) setDragPdv(pdv);
  }

  function onDragEnd(ev: DragEndEvent) {
    setDragPdv(null);
    const pdv = ev.active.data.current?.pdv as ProducaoPdvRef | undefined;
    const over = ev.over?.data.current as { subKey?: string; programaId?: string } | undefined;
    const subKey = over?.subKey;
    const programaId = over?.programaId;
    if (!pdv || !subKey || !programaId) return;

    setOverrides((prev) => {
      const rest = prev.filter((o) => o.rioPdvId !== pdv.rioPdvId);
      return [
        ...rest,
        {
          rioPdvId: pdv.rioPdvId,
          targetSubKey: subKey,
          targetProgramaId: programaId,
        },
      ];
    });
    setMsg(`PDV «${pdv.nome}» movido na produção (arraste salvo neste navegador).`);
  }

  const selectedPdv = useMemo(() => {
    if (!selProdPdvId) return null;
    for (const m of masters) {
      for (const s of m.subClientes) {
        for (const pr of s.programas) {
          const p = pr.pdvs.find((x) => x.rioPdvId === selProdPdvId);
          if (p) return { master: m, sub: s, programa: pr, pdv: p };
        }
      }
    }
    return null;
  }, [masters, selProdPdvId]);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col">
        <header className="mb-2 shrink-0 px-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Cadastros
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Rio (cobrança) × Produção
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            <strong>Esquerda:</strong> hierarquia da Planilha Rio (só leitura).{" "}
            <strong>Direita:</strong> cliente master → sub-cliente → programa → PDVs — agrupamento
            automático (Hering, Reserva, Agilita…). Arraste PDVs na produção para reorganizar.
          </p>
        </header>

        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 px-1">
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={activeYm}
            onChange={(e) => setActiveYm(Number(e.target.value))}
          >
            {(months.length ? months : [{ id: "", yearMonth: activeYm }]).map((m) => (
              <option key={m.yearMonth} value={m.yearMonth}>
                {formatYearMonthLabel(m.yearMonth)}
              </option>
            ))}
          </select>
          <input
            className="min-w-[180px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="text-[11px] text-slate-500">
            Rio: {rioStats.grupos} marcas · {rioStats.pdvs} PDVs · Produção: {masters.length}{" "}
            masters
          </span>
          {overrides.length > 0 ?
            <button
              type="button"
              className="text-[11px] text-violet-700 underline"
              onClick={() => setOverrides([])}
            >
              Limpar arrastes ({overrides.length})
            </button>
          : null}
        </div>

        {msg ?
          <p className="mb-2 shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {msg}
          </p>
        : null}

        <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {/* —— Planilha Rio (cobrança) —— */}
          <div className="flex w-1/2 min-w-0 flex-col border-r border-slate-200 bg-[#FAFAF7] dark:border-slate-700 dark:bg-slate-950">
            <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#C4146A]">
                Planilha Rio · cobrança
              </p>
              <p className="text-xs text-slate-500">Marca → cliente CA → PDV (não edita)</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {filteredRio.length === 0 ?
                <p className="p-4 text-center text-sm text-slate-500">
                  {busy ? "Carregando…" : "Sem dados."}
                </p>
              : filteredRio.map((g) => {
                  const icon = grupoIconStyle(g.nome);
                  const gOpen = rioExpanded.has(g.id);
                  return (
                    <div key={g.id} className="mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <button
                        type="button"
                        className={
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold " +
                          (rioSel?.tipo === "marca" && rioSel.grupoId === g.id ?
                            "bg-pink-50 dark:bg-pink-950/30"
                          : "bg-pink-50/60 dark:bg-pink-950/10")
                        }
                        onClick={() => {
                          setRioExpanded((p) => {
                            const n = new Set(p);
                            if (n.has(g.id)) n.delete(g.id);
                            else n.add(g.id);
                            return n;
                          });
                          setRioSel({ tipo: "marca", grupoId: g.id, marcaNome: g.nome });
                        }}
                      >
                        <span className="text-slate-400">{gOpen ? "▾" : "▸"}</span>
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-white"
                          style={{ background: icon.background }}
                        >
                          {icon.initial}
                        </span>
                        <span className="flex-1 truncate">{g.nome}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {g.clientes.length} · {g.pdvCount} PDV
                        </span>
                      </button>
                      {gOpen ?
                        g.clientes.map((c) => {
                          const cOpen = rioClienteOpen.has(c.id);
                          const active =
                            rioSel?.tipo !== "marca" && rioSel?.rioLinhaId === c.id;
                          return (
                            <div key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                              <button
                                type="button"
                                className={
                                  "flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm font-semibold " +
                                  (active ?
                                    "border-l-[3px] border-l-[#C4146A] bg-pink-50/50 pl-[29px] dark:bg-pink-950/20"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/40")
                                }
                                onClick={() => {
                                  setRioClienteOpen((p) => {
                                    const n = new Set(p);
                                    if (n.has(c.id)) n.delete(c.id);
                                    else n.add(c.id);
                                    return n;
                                  });
                                  selectRioCliente(g.id, c.id);
                                }}
                              >
                                <span className="text-[10px] text-slate-400">
                                  {cOpen ? "▾" : "▸"}
                                </span>
                                <span className="flex-1 truncate">{c.nomeFantasia}</span>
                                <span className="text-[10px] text-slate-400">
                                  {c.linkedCount}/{c.pdvs.length}
                                </span>
                              </button>
                              {cOpen ?
                                c.pdvs.map((p) => (
                                  <div
                                    key={p.id}
                                    className="border-t border-slate-50 py-1.5 pl-14 pr-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400"
                                  >
                                    📻 {p.nome}
                                  </div>
                                ))
                              : null}
                            </div>
                          );
                        })
                      : null}
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* —— Produção musical —— */}
          <div className="flex w-1/2 min-w-0 flex-col bg-white dark:bg-slate-900">
            <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <p className="text-[9px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
                Produção musical
              </p>
              <p className="text-xs text-slate-500">
                Master → cliente → programa → PDVs · arraste ⠿ para mover
              </p>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-y-auto p-3">
                {mastersFiltered.length === 0 ?
                  <p className="text-sm text-slate-500">Nenhum master neste filtro.</p>
                : mastersFiltered.map((m) => {
                    const mOpen = prodExpanded.has(m.key);
                    const highlightMaster =
                      rioSel &&
                      m.subClientes.some((s) =>
                        rioSel.tipo !== "marca" ?
                          s.rioLinhaIds.includes(rioSel.rioLinhaId)
                        : s.marcaRio && s.marcaRio === rioSel.marcaNome,
                      );
                    return (
                      <div
                        key={m.key}
                        className={
                          "mb-3 overflow-hidden rounded-lg border " +
                          (highlightMaster ?
                            "border-violet-300 dark:border-violet-600"
                          : "border-slate-200 dark:border-slate-700")
                        }
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 bg-violet-50 px-3 py-2.5 text-left font-bold text-slate-900 dark:bg-violet-950/30 dark:text-white"
                          onClick={() =>
                            setProdExpanded((p) => {
                              const n = new Set(p);
                              if (n.has(m.key)) n.delete(m.key);
                              else n.add(m.key);
                              return n;
                            })
                          }
                        >
                          <span className="text-slate-400">{mOpen ? "▾" : "▸"}</span>
                          <span>🏢</span>
                          <span className="flex-1">{m.nome}</span>
                          <span className="text-[10px] font-normal text-slate-500">
                            {m.subClientes.length} sub · {m.pdvCount} PDV
                          </span>
                        </button>
                        {mOpen ?
                          m.subClientes.map((s) => {
                            const badge = origemBadge(s.rioOrigem);
                            const subOpen = prodExpanded.has(s.key);
                            const highlightSub =
                              rioSel?.tipo !== "marca" &&
                              rioSel?.rioLinhaId &&
                              s.rioLinhaIds.includes(rioSel.rioLinhaId);
                            return (
                              <div
                                key={s.key}
                                className={
                                  "border-t border-slate-100 dark:border-slate-800 " +
                                  (highlightSub ? "bg-violet-50/40 dark:bg-violet-950/20" : "")
                                }
                              >
                                <button
                                  type="button"
                                  className="flex w-full items-start gap-2 px-3 py-2 pl-6 text-left"
                                  onClick={() =>
                                    setProdExpanded((p) => {
                                      const n = new Set(p);
                                      if (n.has(s.key)) n.delete(s.key);
                                      else n.add(s.key);
                                      return n;
                                    })
                                  }
                                >
                                  <span className="mt-0.5 text-[10px] text-slate-400">
                                    {subOpen ? "▾" : "▸"}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                      {s.nome}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-1">
                                      <span
                                        className={
                                          "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase " +
                                          badge.className
                                        }
                                      >
                                        {badge.label}
                                      </span>
                                      {s.marcaRio ?
                                        <span className="text-[9px] text-slate-400">
                                          marca Rio: {s.marcaRio}
                                        </span>
                                      : null}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-slate-400">{s.pdvCount}</span>
                                </button>
                                {subOpen ?
                                  s.programas.map((pr) => (
                                    <ProgramaDropZone key={pr.id} sub={s} programa={pr}>
                                      {pr.pdvs.length === 0 ?
                                        <p className="text-[10px] italic text-slate-400">
                                          Solte PDVs aqui
                                        </p>
                                      : pr.pdvs.map((pdv) => (
                                          <DraggableProdPdv
                                            key={pdv.rioPdvId}
                                            pdv={pdv}
                                            selected={selProdPdvId === pdv.rioPdvId}
                                            onSelect={() => {
                                              setSelProdPdvId(pdv.rioPdvId);
                                              void loadSuggestions(pdv.rioPdvId);
                                            }}
                                          />
                                        ))
                                      }
                                    </ProgramaDropZone>
                                  ))
                                : null}
                              </div>
                            );
                          })
                        : null}
                      </div>
                    );
                  })
                }
              </div>

              {/* Painel vínculo legado */}
              {selectedPdv ?
                <div className="w-[200px] shrink-0 overflow-y-auto border-l border-slate-200 p-2 dark:border-slate-700">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Painel legado</p>
                  <p className="text-xs font-semibold">{selectedPdv.pdv.nome}</p>
                  <p className="text-[10px] text-slate-500">
                    CNPJ {displayBrazilianTaxId(selectedPdv.pdv.documento)}
                  </p>
                  {selectedPdv.pdv.painelLink ?
                    <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-[10px] dark:border-emerald-900 dark:bg-emerald-950/40">
                      #{selectedPdv.pdv.painelLink.painelPdvId}
                      <a
                        href={painelPdvEditUrl(
                          selectedPdv.pdv.painelLink.painelPdvId,
                          selectedPdv.pdv.painelLink.painelClienteId,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-sky-700 hover:underline"
                      >
                        Abrir ↗
                      </a>
                    </div>
                  : <div className="mt-2 space-y-1">
                      {suggestions.slice(0, 4).map((s) => (
                        <button
                          key={s.painelPdvId}
                          type="button"
                          disabled={busy}
                          className="w-full rounded border border-violet-200 bg-violet-50 px-1.5 py-1 text-left text-[10px] hover:bg-violet-100"
                          onClick={() => void savePainelLink(selectedPdv.pdv.rioPdvId, s)}
                        >
                          {s.score}% {s.painelPdvNome}
                        </button>
                      ))}
                    </div>
                  }
                </div>
              : null}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay>
        {dragPdv ?
          <div className="rounded-md border border-violet-300 bg-white px-3 py-2 text-xs shadow-lg">
            📻 {dragPdv.nome}
          </div>
        : null}
      </DragOverlay>
    </DndContext>
  );
}
