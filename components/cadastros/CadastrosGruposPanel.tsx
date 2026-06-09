"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PdvCadastroDrawer } from "@/components/cadastros/PdvCadastroDrawer";
import {
  buildProducaoTree,
  grupoIconStyle,
  treeStats,
  type PainelLinkBrief,
  type ProducaoGrupoNode,
  type RioMonthBundle,
} from "@/lib/cadastros/rioProducaoTree";
import {
  buildProducaoClientes,
  clientesForRioSelection,
  countHiddenEmptyClientes,
  findClienteForRioLinha,
  isCustomClienteKey,
  mergeProducaoLayout,
  newCustomClienteKey,
  prodClienteDropId,
  prodPdvDragId,
  type PdvPlacementOverride,
  type ProducaoClienteBucket,
  type ProducaoCustomCliente,
  type ProducaoLayoutState,
  type ProducaoPdvRef,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
} from "@/lib/manualReminders/yearMonth";

type MonthMeta = { id: string; yearMonth: number };

type RioSel =
  | { tipo: "marca"; grupoId: string; marcaNome: string; linhaIds: string[] }
  | { tipo: "cliente"; rioLinhaId: string; grupoId: string }
  | null;

function DraggableProdPdv({
  pdv,
  selected,
  editMode,
  onSelect,
}: {
  pdv: ProducaoPdvRef;
  selected: boolean;
  editMode: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: prodPdvDragId(pdv.rioPdvId),
    data: { pdv },
    disabled: !editMode,
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
      {editMode ?
        <button
          type="button"
          className="cursor-grab text-slate-400 active:cursor-grabbing"
          aria-label="Arrastar PDV"
          {...listeners}
          {...attributes}
        >
          ⠿
        </button>
      : <span className="w-4 text-slate-300">📻</span>}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="font-medium text-slate-800 dark:text-slate-100">{pdv.nome}</span>
        {pdv.isLinhaProxy ?
          <span className="ml-1 text-[10px] text-amber-600">· cliente = PDV</span>
        : null}
        <span className="ml-1 text-[10px] text-slate-400">
          {linked ? `· painel #${pdv.painelLink!.painelPdvId}` : "· sem painel"}
        </span>
      </button>
    </div>
  );
}

function ClienteDropZone({
  cliente,
  editMode,
  children,
}: {
  cliente: ProducaoClienteBucket;
  editMode: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: prodClienteDropId(cliente.key),
    data: { clienteKey: cliente.key },
    disabled: !editMode,
  });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-md border border-dashed p-2 transition-colors " +
        (editMode && isOver ?
          "border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/30"
        : "border-transparent")
      }
    >
      {children}
    </div>
  );
}

export function CadastrosGruposPanel() {
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState(todayYm);
  const [rioGrupos, setRioGrupos] = useState<ProducaoGrupoNode[]>([]);
  const [clientesBase, setClientesBase] = useState<ProducaoClienteBucket[]>([]);
  const [clienteNomes, setClienteNomes] = useState<Record<string, string>>({});
  const [placements, setPlacements] = useState<PdvPlacementOverride[]>([]);
  const [hiddenClienteKeys, setHiddenClienteKeys] = useState<string[]>([]);
  const [customClientes, setCustomClientes] = useState<ProducaoCustomCliente[]>([]);
  const [showHiddenGroups, setShowHiddenGroups] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [rioExpanded, setRioExpanded] = useState<Set<string>>(new Set());
  const [rioClienteOpen, setRioClienteOpen] = useState<Set<string>>(new Set());
  const [prodExpanded, setProdExpanded] = useState<Set<string>>(new Set());
  const [rioSel, setRioSel] = useState<RioSel>(null);
  const [selProdPdvId, setSelProdPdvId] = useState<string | null>(null);
  const [dragPdv, setDragPdv] = useState<ProducaoPdvRef | null>(null);
  const saveLayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const layoutState = useMemo<ProducaoLayoutState>(
    () => ({
      clienteNomes,
      pdvPlacements: placements,
      hiddenClienteKeys,
      customClientes,
    }),
    [clienteNomes, placements, hiddenClienteKeys, customClientes],
  );

  const clientes = useMemo(
    () => mergeProducaoLayout(clientesBase, layoutState, { showHidden: showHiddenGroups }),
    [clientesBase, layoutState, showHiddenGroups],
  );

  const hiddenEmptyCount = useMemo(
    () => countHiddenEmptyClientes(clientesBase, layoutState),
    [clientesBase, layoutState],
  );

  const clientesFiltered = useMemo(() => {
    if (!rioSel) return clientes;
    if (rioSel.tipo === "cliente") {
      return clientesForRioSelection(clientes, { tipo: "cliente", rioLinhaId: rioSel.rioLinhaId });
    }
    return clientesForRioSelection(
      clientes,
      { tipo: "marca", marcaNome: rioSel.marcaNome },
      rioSel.linhaIds,
    );
  }, [clientes, rioSel]);

  const rioStats = useMemo(() => treeStats(rioGrupos), [rioGrupos]);

  const persistLayout = useCallback(
    (layout: ProducaoLayoutState) => {
      if (saveLayoutTimer.current) clearTimeout(saveLayoutTimer.current);
      saveLayoutTimer.current = setTimeout(() => {
        void fetch(`/api/cadastros/month/${activeYm}/producao-layout`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(layout),
        }).catch(() => {});
      }, 600);
    },
    [activeYm],
  );

  const applyLayoutChange = useCallback(
    (partial: Partial<ProducaoLayoutState>) => {
      const next: ProducaoLayoutState = {
        clienteNomes: partial.clienteNomes ?? clienteNomes,
        pdvPlacements: partial.pdvPlacements ?? placements,
        hiddenClienteKeys: partial.hiddenClienteKeys ?? hiddenClienteKeys,
        customClientes: partial.customClientes ?? customClientes,
      };
      setClienteNomes(next.clienteNomes);
      setPlacements(next.pdvPlacements);
      setHiddenClienteKeys(next.hiddenClienteKeys);
      setCustomClientes(next.customClientes);
      persistLayout(next);
      return next;
    },
    [clienteNomes, placements, hiddenClienteKeys, customClientes, persistLayout],
  );

  const loadAll = useCallback(async (ym: number) => {
    setBusy(true);
    setMsg("");
    try {
      const [mRes, vRes, layoutRes] = await Promise.all([
        fetch(`/api/rio-planilha/clientes/month/${ym}`),
        fetch(`/api/cadastros/month/${ym}/vinculos`),
        fetch(`/api/cadastros/month/${ym}/producao-layout`),
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
      const layoutData = (await layoutRes.json()) as {
        ok?: boolean;
        layout?: ProducaoLayoutState;
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

      const linhasForProd: RioLinhaForProducao[] = (monthData.linhas ?? []).map((ln) => ({
        id: ln.id,
        nomeFantasia: ln.nomeFantasia,
        razaoSocial: ln.razaoSocial,
        documento: ln.documento,
        pdvs: ln.pdvs,
      }));

      const prod = buildProducaoClientes(linhasForProd, linkMap);
      setClientesBase(prod);
      setProdExpanded(new Set(prod.map((c) => c.key)));

      setClienteNomes(layoutData.layout?.clienteNomes ?? {});
      setPlacements(layoutData.layout?.pdvPlacements ?? []);
      setHiddenClienteKeys(layoutData.layout?.hiddenClienteKeys ?? []);
      setCustomClientes(layoutData.layout?.customClientes ?? []);
      setShowHiddenGroups(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar.");
      setRioGrupos([]);
      setClientesBase([]);
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

  const filteredRio = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rioGrupos;
    return rioGrupos
      .map((g) => {
        const clientesF = g.clientes.filter((c) => {
          const blob = `${g.nome} ${c.nomeFantasia} ${c.pdvs.map((p) => p.nome).join(" ")}`.toLowerCase();
          return blob.includes(needle);
        });
        if (!clientesF.length && !g.nome.toLowerCase().includes(needle)) return null;
        return { ...g, clientes: clientesF };
      })
      .filter(Boolean) as ProducaoGrupoNode[];
  }, [rioGrupos, q]);

  function selectRioCliente(grupoId: string, rioLinhaId: string) {
    setRioSel({ tipo: "cliente", rioLinhaId, grupoId });
    setSelProdPdvId(null);
    const hit = findClienteForRioLinha(clientes, rioLinhaId);
    if (hit) setProdExpanded((prev) => new Set([...prev, hit.key]));
  }

  function renameCliente(key: string, nome: string) {
    const nextNomes = { ...clienteNomes, [key]: nome };
    const nextCustom =
      isCustomClienteKey(key) ?
        customClientes.map((c) => (c.key === key ? { ...c, nome } : c))
      : customClientes;
    applyLayoutChange({ clienteNomes: nextNomes, customClientes: nextCustom });
  }

  function hideEmptyCliente(key: string) {
    if (hiddenClienteKeys.includes(key)) return;
    applyLayoutChange({ hiddenClienteKeys: [...hiddenClienteKeys, key] });
    setMsg("Grupo vazio ocultado.");
  }

  function restoreHiddenCliente(key: string) {
    applyLayoutChange({
      hiddenClienteKeys: hiddenClienteKeys.filter((k) => k !== key),
    });
    setProdExpanded((prev) => new Set([...prev, key]));
    setMsg("Grupo restaurado.");
  }

  function addCustomCliente() {
    const key = newCustomClienteKey();
    const nome = `Novo grupo ${customClientes.length + 1}`;
    applyLayoutChange({
      customClientes: [...customClientes, { key, nome }],
      clienteNomes: { ...clienteNomes, [key]: nome },
    });
    setProdExpanded((prev) => new Set([...prev, key]));
    setMsg(`Grupo «${nome}» criado — arraste PDVs para ele.`);
  }

  function deleteCustomCliente(key: string) {
    if (!isCustomClienteKey(key)) return;
    const nextCustom = customClientes.filter((c) => c.key !== key);
    const nextNomes = { ...clienteNomes };
    delete nextNomes[key];
    const nextHidden = hiddenClienteKeys.filter((k) => k !== key);
    const nextPlacements = placements.filter((p) => p.targetClienteKey !== key);
    applyLayoutChange({
      customClientes: nextCustom,
      clienteNomes: nextNomes,
      hiddenClienteKeys: nextHidden,
      pdvPlacements: nextPlacements,
    });
    setMsg("Grupo manual removido.");
  }

  function onDragStart(ev: DragStartEvent) {
    if (!editMode) return;
    const pdv = ev.active.data.current?.pdv as ProducaoPdvRef | undefined;
    if (pdv) setDragPdv(pdv);
  }

  function onDragEnd(ev: DragEndEvent) {
    setDragPdv(null);
    if (!editMode) return;
    const pdv = ev.active.data.current?.pdv as ProducaoPdvRef | undefined;
    const clienteKey = ev.over?.data.current?.clienteKey as string | undefined;
    if (!pdv || !clienteKey) return;

    const nextPlacements = [
      ...placements.filter((o) => o.rioPdvId !== pdv.rioPdvId),
      { rioPdvId: pdv.rioPdvId, targetClienteKey: clienteKey },
    ];
    const nextHidden = hiddenClienteKeys.filter((k) => k !== clienteKey);
    applyLayoutChange({ pdvPlacements: nextPlacements, hiddenClienteKeys: nextHidden });
    setMsg(`PDV «${pdv.nome}» movido para «${clientes.find((c) => c.key === clienteKey)?.nome ?? "grupo"}».`);
  }

  const prodPdvCount = clientes.reduce((n, c) => n + c.pdvCount, 0);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col">
        <header className="mb-2 shrink-0 px-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cadastros</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Rio (cobrança) × Produção
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            <strong>Esquerda:</strong> Planilha Rio (só leitura, com marcas).{" "}
            <strong>Direita:</strong> cliente → PDVs (sem marca). Cliente sem PDV na Rio vira um PDV
            na produção.
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
            Rio: {rioStats.grupos} marcas · {rioStats.pdvs} PDVs · Produção: {clientes.length}{" "}
            clientes · {prodPdvCount} PDVs
          </span>
        </div>

        {msg ?
          <p className="mb-2 shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {msg}
          </p>
        : null}

        <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {/* Planilha Rio */}
          <div className="flex w-1/2 min-w-0 flex-col border-r border-slate-200 bg-[#FAFAF7] dark:border-slate-700 dark:bg-slate-950">
            <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#C4146A]">
                Planilha Rio · cobrança
              </p>
              <p className="text-xs text-slate-500">Marca → cliente → PDV (somente leitura)</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {filteredRio.length === 0 ?
                <p className="p-4 text-center text-sm text-slate-500">{busy ? "Carregando…" : "Sem dados."}</p>
              : filteredRio.map((g) => {
                  const icon = grupoIconStyle(g.nome);
                  const gOpen = rioExpanded.has(g.id);
                  return (
                    <div
                      key={g.id}
                      className="mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 bg-pink-50/60 px-3 py-2 text-left text-sm font-bold dark:bg-pink-950/10"
                        onClick={() => {
                          setRioExpanded((p) => {
                            const n = new Set(p);
                            if (n.has(g.id)) n.delete(g.id);
                            else n.add(g.id);
                            return n;
                          });
                          setRioSel({
                            tipo: "marca",
                            grupoId: g.id,
                            marcaNome: g.nome,
                            linhaIds: g.clientes.map((c) => c.id),
                          });
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
                          const active = rioSel?.tipo === "cliente" && rioSel.rioLinhaId === c.id;
                          return (
                            <div key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                              <button
                                type="button"
                                className={
                                  "flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm font-semibold " +
                                  (active ?
                                    "border-l-[3px] border-l-[#C4146A] bg-pink-50/50 pl-[29px]"
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
                                <span className="text-[10px] text-slate-400">{cOpen ? "▾" : "▸"}</span>
                                <span className="flex-1 truncate">{c.nomeFantasia}</span>
                                <span className="text-[10px] text-slate-400">
                                  {c.linkedCount}/{c.pdvs.length}
                                </span>
                              </button>
                              {cOpen ?
                                c.pdvs.map((p) => (
                                  <div
                                    key={p.id}
                                    className="border-t border-slate-50 py-1.5 pl-14 pr-3 text-xs text-slate-600 dark:border-slate-800"
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

          {/* Produção musical */}
          <div className="flex w-1/2 min-w-0 flex-col bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
                  Produção musical
                </p>
                <p className="text-xs text-slate-500">Cliente → PDVs (sem marca Rio)</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {editMode && hiddenEmptyCount > 0 ?
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-600"
                    onClick={() => setShowHiddenGroups((v) => !v)}
                  >
                    {showHiddenGroups ?
                      "Ocultar vazios"
                    : `Ver ocultos (${hiddenEmptyCount})`}
                  </button>
                : null}
                {editMode ?
                  <button
                    type="button"
                    className="rounded-md border border-violet-300 px-2 py-1 text-[11px] font-semibold text-violet-800 dark:border-violet-600 dark:text-violet-200"
                    onClick={addCustomCliente}
                  >
                    + Novo grupo
                  </button>
                : null}
                <button
                  type="button"
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-semibold " +
                    (editMode ?
                      "bg-violet-700 text-white"
                    : "border border-violet-300 text-violet-800 dark:border-violet-600 dark:text-violet-200")
                  }
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? "Edição ativa" : "Editar produção"}
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-y-auto p-3">
                {clientesFiltered.length === 0 ?
                  <p className="text-sm text-slate-500">Nenhum cliente neste filtro.</p>
                : clientesFiltered.map((c) => {
                    const cOpen = prodExpanded.has(c.key);
                    const highlight =
                      rioSel?.tipo === "cliente" && rioSel.rioLinhaId === c.rioLinhaId;
                    const isEmpty = c.pdvCount === 0;
                    const isHidden =
                      isEmpty && hiddenClienteKeys.includes(c.key) && showHiddenGroups;
                    return (
                      <div
                        key={c.key}
                        className={
                          "mb-3 overflow-hidden rounded-lg border " +
                          (highlight ?
                            "border-violet-300 dark:border-violet-600"
                          : isHidden ?
                            "border-dashed border-slate-300 opacity-80 dark:border-slate-600"
                          : "border-slate-200 dark:border-slate-700")
                        }
                      >
                        <div
                          className={
                            "flex flex-wrap items-center gap-2 px-3 py-2 " +
                            (isEmpty ?
                              "bg-slate-100 dark:bg-slate-800/60"
                            : "bg-violet-50 dark:bg-violet-950/30")
                          }
                        >
                          <button
                            type="button"
                            className="text-slate-400"
                            onClick={() =>
                              setProdExpanded((p) => {
                                const n = new Set(p);
                                if (n.has(c.key)) n.delete(c.key);
                                else n.add(c.key);
                                return n;
                              })
                            }
                          >
                            {cOpen ? "▾" : "▸"}
                          </button>
                          {editMode ?
                            <input
                              className="min-w-0 flex-1 rounded border border-violet-200 bg-white px-2 py-1 text-sm font-bold dark:border-violet-700 dark:bg-slate-900"
                              value={c.nome}
                              onChange={(e) => renameCliente(c.key, e.target.value)}
                            />
                          : <span className="flex-1 text-sm font-bold text-slate-900 dark:text-white">
                              {c.nome}
                            </span>
                          }
                          {isEmpty ?
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              vazio
                            </span>
                          : null}
                          {c.isCustom || isCustomClienteKey(c.key) ?
                            <span className="text-[9px] text-violet-600 dark:text-violet-300">
                              manual
                            </span>
                          : null}
                          <span className="text-[10px] text-slate-500">{c.pdvCount} PDV</span>
                          {editMode && isEmpty ?
                            isHidden ?
                              <button
                                type="button"
                                className="text-[10px] text-sky-700 underline"
                                onClick={() => restoreHiddenCliente(c.key)}
                              >
                                Restaurar
                              </button>
                            : <button
                                type="button"
                                className="text-[10px] text-slate-600 underline"
                                onClick={() => hideEmptyCliente(c.key)}
                              >
                                Ocultar
                              </button>
                          : null}
                          {editMode && (c.isCustom || isCustomClienteKey(c.key)) && isEmpty ?
                            <button
                              type="button"
                              className="text-[10px] text-rose-700 underline"
                              onClick={() => deleteCustomCliente(c.key)}
                            >
                              Excluir
                            </button>
                          : null}
                        </div>
                        {cOpen ?
                          <ClienteDropZone cliente={c} editMode={editMode}>
                            {c.pdvs.length === 0 ?
                              <p className="text-[10px] italic text-slate-400">
                                {editMode ? "Solte PDVs aqui" : "Sem PDVs"}
                              </p>
                            : c.pdvs.map((pdv) => (
                                <DraggableProdPdv
                                  key={pdv.rioPdvId}
                                  pdv={pdv}
                                  editMode={editMode}
                                  selected={selProdPdvId === pdv.rioPdvId}
                                  onSelect={() => setSelProdPdvId(pdv.rioPdvId)}
                                />
                              ))
                            }
                          </ClienteDropZone>
                        : null}
                      </div>
                    );
                  })
                }
              </div>

              <PdvCadastroDrawer
                rioPdvKey={selProdPdvId}
                editMode={editMode}
                onClose={() => setSelProdPdvId(null)}
              />
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
