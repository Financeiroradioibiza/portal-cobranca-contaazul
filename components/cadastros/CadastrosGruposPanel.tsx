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
import { CadastrosMovimentoBanner } from "@/components/cadastros/CadastrosMovimentoBanner";
import { PdvCadastroDrawer } from "@/components/cadastros/PdvCadastroDrawer";
import { RioTagCobrancaNome } from "@/components/rio/RioTagCobrancaNome";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { rioTagCobrancaRowBgClass } from "@/lib/rio/rioTagCobranca";
import {
  buildProducaoTree,
  extractRioTreeMovimentos,
  grupoIconStyle,
  type PainelLinkBrief,
  type ProducaoGrupoNode,
  type RioMonthBundle,
  type RioMovimentoRow,
} from "@/lib/cadastros/rioProducaoTree";
import {
  extractRioMovimentos,
  movimentoItemToPdvRef,
  PRODUCAO_MOVIMENTO_TOP_ENABLED,
  reconcileProducaoLayout,
  stripNovosFromClientes,
} from "@/lib/cadastros/producaoMovimento";
import {
  buildCaByLinhaId,
  buildProducaoClientes,
  clientesForRioSelection,
  countHiddenEmptyClientes,
  countProducaoMusicalPdvs,
  countRioPlanilhaPdvs,
  filterProducaoClientesVisiveis,
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
  buildVinculosReconcileReport,
  collectProducaoPdvs,
  semPainelMotivo,
  semPainelMotivoLabel,
} from "@/lib/cadastros/vinculosReconcile";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

const PRODUCAO_LAYOUT_YM = 0;

type RioSel =
  | { tipo: "marca"; grupoId: string; marcaNome: string; linhaIds: string[] }
  | { tipo: "cliente"; rioLinhaId: string; grupoId: string }
  | null;

function DraggableProdPdv({
  pdv,
  selected,
  multiSelected,
  editMode,
  onSelect,
  onToggleMulti,
  onActivateId,
  activating,
  tone = "normal",
}: {
  pdv: ProducaoPdvRef;
  selected: boolean;
  multiSelected: boolean;
  editMode: boolean;
  onSelect: () => void;
  onToggleMulti: (checked: boolean) => void;
  onActivateId?: () => void;
  activating?: boolean;
  tone?: "normal" | "novo" | "pendencia";
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: prodPdvDragId(pdv.rioPdvId),
    data: { pdv },
    disabled: !editMode,
  });
  const linked = Boolean(pdv.portalPlayerId);
  const motivo = linked ? null : semPainelMotivo(pdv);
  const tagBg =
    !selected && !multiSelected ?
      rioTagCobrancaRowBgClass(pdv.tagCobranca)
    : "";
  const usePendenciaTone =
    (tone === "novo" || tone === "pendencia") && !tagBg;

  return (
    <div
      ref={setNodeRef}
      className={
        "mb-1 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-opacity " +
        (selected ?
          "border-[#C4146A] bg-pink-50 dark:border-pink-500 dark:bg-pink-950/30"
        : multiSelected ?
          "border-violet-500 bg-violet-50 ring-1 ring-violet-300 dark:border-violet-400 dark:bg-violet-950/40 dark:ring-violet-600"
        : usePendenciaTone ?
          "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30"
        : tagBg || "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900") +
        (isDragging ? " opacity-40" : "")
      }
    >
      {editMode ?
        <>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0 accent-violet-600"
            checked={multiSelected}
            aria-label={`Selecionar ${pdv.nome}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleMulti(e.target.checked)}
          />
          <button
            type="button"
            className="cursor-grab text-slate-400 active:cursor-grabbing"
            aria-label="Arrastar PDV"
            {...listeners}
            {...attributes}
          >
            ⠿
          </button>
        </>
      : <span className="w-4 text-slate-300">📻</span>}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <RioTagCobrancaNome
          nome={pdv.nome}
          tag={pdv.tagCobranca}
          className="font-medium"
        />
        {pdv.isLinhaProxy ?
          <span className="ml-1 text-[10px] text-amber-600">· cliente = PDV</span>
        : null}
        <span className="ml-1 text-[10px] text-slate-400">
          {linked ?
            `· Player ${formatPortalPdvIdDisplay(pdv.portalPlayerId!.portalPdvId)}`
          : "· sem ID Player"}
        </span>
        {motivo ?
          <span
            className={
              "ml-1 text-[10px] " +
              (motivo === "linha_proxy" ?
                "text-amber-700 dark:text-amber-400"
              : "text-sky-700 dark:text-sky-400")
            }
            title={semPainelMotivoLabel(motivo)}
          >
            · {semPainelMotivoLabel(motivo)}
          </span>
        : null}
      </button>
      {!linked && !editMode && onActivateId ?
        <button
          type="button"
          disabled={activating}
          onClick={(e) => {
            e.stopPropagation();
            onActivateId();
          }}
          className="shrink-0 rounded border border-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-950/40"
        >
          {activating ? "…" : "Ativar ID"}
        </button>
      : null}
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

function bucketPortalClienteId(c: ProducaoClienteBucket): number | null {
  for (const p of c.pdvs) {
    const id = p.portalPlayerId?.portalClienteId;
    if (id != null) return id;
  }
  return null;
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ?
        "Resposta inválida do servidor."
      : `Erro ${res.status} ao comunicar com o servidor.`,
    );
  }
}

export function CadastrosGruposPanel() {
  const [rioSourceYm, setRioSourceYm] = useState<number | null>(null);
  const [rioGrupos, setRioGrupos] = useState<ProducaoGrupoNode[]>([]);
  const [clientesBase, setClientesBase] = useState<ProducaoClienteBucket[]>([]);
  const [clienteNomes, setClienteNomes] = useState<Record<string, string>>({});
  const [placements, setPlacements] = useState<PdvPlacementOverride[]>([]);
  const [hiddenClienteKeys, setHiddenClienteKeys] = useState<string[]>([]);
  const [customClientes, setCustomClientes] = useState<ProducaoCustomCliente[]>([]);
  const [acknowledgedPdvs, setAcknowledgedPdvs] = useState<string[]>([]);
  const [movimentoBaselineEntradaIds, setMovimentoBaselineEntradaIds] = useState<string[]>([]);
  const [movimentoBaselineSaidaIds, setMovimentoBaselineSaidaIds] = useState<string[]>([]);
  const [linhasRio, setLinhasRio] = useState<RioLinhaForProducao[]>([]);
  const [linkMap, setLinkMap] = useState<Map<string, PainelLinkBrief>>(new Map());
  const [rioTreeMov, setRioTreeMov] = useState<{
    novos: RioMovimentoRow[];
    encerrados: RioMovimentoRow[];
  }>({ novos: [], encerrados: [] });
  const [showHiddenGroups, setShowHiddenGroups] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [activatingPdvKey, setActivatingPdvKey] = useState<string | null>(null);
  const [activatingBucketKey, setActivatingBucketKey] = useState<string | null>(null);
  const [provisioningBucketKey, setProvisioningBucketKey] = useState<string | null>(null);
  const [playerLoginClienteIds, setPlayerLoginClienteIds] = useState<Set<number>>(() => new Set());
  const [q, setQ] = useState("");
  const [onlySemPainel, setOnlySemPainel] = useState(false);
  const [showVinculoDiag, setShowVinculoDiag] = useState(false);
  const [vinculosStats, setVinculosStats] = useState({ total: 0, linked: 0, unlinked: 0 });
  const [rioExpanded, setRioExpanded] = useState<Set<string>>(new Set());
  const [rioClienteOpen, setRioClienteOpen] = useState<Set<string>>(new Set());
  const [prodExpanded, setProdExpanded] = useState<Set<string>>(new Set());
  const [prodNovosOpen, setProdNovosOpen] = useState(true);
  const [rioSel, setRioSel] = useState<RioSel>(null);
  const [selProdPdvId, setSelProdPdvId] = useState<string | null>(null);
  const [dragPdv, setDragPdv] = useState<ProducaoPdvRef | null>(null);
  const [dragBatch, setDragBatch] = useState<ProducaoPdvRef[]>([]);
  const [selectedPdvIds, setSelectedPdvIds] = useState<Set<string>>(new Set());
  const saveLayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const layoutState = useMemo<ProducaoLayoutState>(
    () => ({
      clienteNomes,
      pdvPlacements: placements,
      hiddenClienteKeys,
      customClientes,
      acknowledgedPdvs,
      movimentoBaselineEntradaIds,
      movimentoBaselineSaidaIds,
    }),
    [clienteNomes, placements, hiddenClienteKeys, customClientes, acknowledgedPdvs, movimentoBaselineEntradaIds, movimentoBaselineSaidaIds],
  );

  const caByLinhaId = useMemo(() => buildCaByLinhaId(linhasRio), [linhasRio]);

  const prodMovimentos = useMemo(
    () => extractRioMovimentos(linhasRio, linkMap, layoutState),
    [linhasRio, linkMap, layoutState],
  );

  const clientes = useMemo(() => {
    const merged = mergeProducaoLayout(clientesBase, layoutState, {
      showHidden: showHiddenGroups,
      caByLinhaId,
    });
    if (!PRODUCAO_MOVIMENTO_TOP_ENABLED) return merged;
    return stripNovosFromClientes(merged, prodMovimentos.novos);
  }, [clientesBase, layoutState, showHiddenGroups, prodMovimentos.novos, caByLinhaId]);

  const hiddenEmptyCount = useMemo(
    () => countHiddenEmptyClientes(clientesBase, layoutState),
    [clientesBase, layoutState],
  );

  const clientesVisiveis = useMemo(
    () => filterProducaoClientesVisiveis(clientes, { keepEmptyCustom: editMode }),
    [clientes, editMode],
  );

  const clientesFiltered = useMemo(() => {
    let base = clientesVisiveis;
    if (rioSel) {
      if (rioSel.tipo === "cliente") {
        base = clientesForRioSelection(clientesVisiveis, {
          tipo: "cliente",
          rioLinhaId: rioSel.rioLinhaId,
        });
      } else {
        base = clientesForRioSelection(
          clientesVisiveis,
          { tipo: "marca", marcaNome: rioSel.marcaNome },
          rioSel.linhaIds,
        );
      }
    }
    if (!onlySemPainel) return base;
    return base
      .map((c) => ({
        ...c,
        pdvs: c.pdvs.filter((p) => !p.portalPlayerId),
        pdvCount: c.pdvs.filter((p) => !p.portalPlayerId).length,
      }))
      .filter((c) => c.pdvCount > 0);
  }, [clientesVisiveis, rioSel, onlySemPainel]);

  const vinculoDiag = useMemo(
    () =>
      buildVinculosReconcileReport({
        linhas: linhasRio,
        vinculosStats,
        producaoPdvs: collectProducaoPdvs(clientesVisiveis),
      }),
    [linhasRio, vinculosStats, clientesVisiveis],
  );

  const allProdPdvs = useMemo(() => {
    const novos =
      PRODUCAO_MOVIMENTO_TOP_ENABLED ?
        prodMovimentos.novos.map((item) => movimentoItemToPdvRef(item))
      : [];
    return [...novos, ...clientesFiltered.flatMap((c) => c.pdvs)];
  }, [prodMovimentos.novos, clientesFiltered]);

  const rioSelLabel = useMemo(() => {
    if (!rioSel) return null;
    if (rioSel.tipo === "marca") return `Marca: ${rioSel.marcaNome}`;
    for (const g of rioGrupos) {
      const c = g.clientes.find((x) => x.id === rioSel.rioLinhaId);
      if (c) return `Cliente: ${c.nomeFantasia}`;
    }
    return "Cliente selecionado";
  }, [rioSel, rioGrupos]);

  const persistLayout = useCallback((layout: ProducaoLayoutState, yearMonth: number) => {
    if (saveLayoutTimer.current) clearTimeout(saveLayoutTimer.current);
    saveLayoutTimer.current = setTimeout(() => {
      void fetch(`/api/cadastros/month/${yearMonth}/producao-layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      }).catch(() => {});
    }, 600);
  }, []);

  const applyLayoutChange = useCallback(
    (partial: Partial<ProducaoLayoutState>) => {
      const next: ProducaoLayoutState = {
        clienteNomes: partial.clienteNomes ?? clienteNomes,
        pdvPlacements: partial.pdvPlacements ?? placements,
        hiddenClienteKeys: partial.hiddenClienteKeys ?? hiddenClienteKeys,
        customClientes: partial.customClientes ?? customClientes,
        acknowledgedPdvs: partial.acknowledgedPdvs ?? acknowledgedPdvs,
      };
      setClienteNomes(next.clienteNomes);
      setPlacements(next.pdvPlacements);
      setHiddenClienteKeys(next.hiddenClienteKeys);
      setCustomClientes(next.customClientes);
      setAcknowledgedPdvs(next.acknowledgedPdvs ?? []);
      persistLayout(next, PRODUCAO_LAYOUT_YM);
      return next;
    },
    [clienteNomes, placements, hiddenClienteKeys, customClientes, acknowledgedPdvs, persistLayout],
  );

  const loadAll = useCallback(async (ym: number) => {
    if (saveLayoutTimer.current) {
      clearTimeout(saveLayoutTimer.current);
      saveLayoutTimer.current = null;
    }
    setBusy(true);
    setMsg("");
    try {
      const [mRes, vRes, layoutRes] = await Promise.all([
        fetch(`/api/rio-planilha/clientes/month/${ym}`),
        fetch(`/api/cadastros/month/${ym}/vinculos`),
        fetch(`/api/cadastros/month/${PRODUCAO_LAYOUT_YM}/producao-layout`),
      ]);
      const monthData = (await mRes.json()) as RioMonthBundle & { error?: string };
      const vincData = (await vRes.json()) as {
        ok?: boolean;
        stats?: { total: number; linked: number; unlinked: number };
        rows?: Array<{
          rioPdvId: string;
          link: {
            portalPdvId: number;
            portalClienteId: number;
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

      const links = new Map<string, PainelLinkBrief>();
      for (const row of vincData.rows ?? []) {
        if (!row.link) continue;
        links.set(row.rioPdvId, {
          portalPdvId: row.link.portalPdvId,
          portalClienteId: row.link.portalClienteId,
        });
      }
      setLinkMap(links);
      setVinculosStats(
        vincData.stats ?? {
          total: vincData.rows?.length ?? 0,
          linked: vincData.rows?.filter((r) => r.link).length ?? 0,
          unlinked: vincData.rows?.filter((r) => !r.link).length ?? 0,
        },
      );

      const bundle = { grupos: monthData.grupos ?? [], linhas: monthData.linhas ?? [] };
      const rioTree = buildProducaoTree(bundle, links);
      setRioGrupos(rioTree);
      setRioExpanded(new Set());
      setRioClienteOpen(new Set());
      setRioTreeMov(extractRioTreeMovimentos(bundle, links));

      const linhasForProd: RioLinhaForProducao[] = (monthData.linhas ?? []).map((ln) => ({
        id: ln.id,
        caPersonId: (ln as { caPersonId?: string }).caPersonId,
        nomeFantasia: ln.nomeFantasia,
        razaoSocial: ln.razaoSocial,
        documento: ln.documento,
        movimento: ln.movimento,
        numeroPdvSite: (ln as { numeroPdvSite?: number }).numeroPdvSite ?? 0,
        tagCobranca: ln.tagCobranca,
        pdvs: ln.pdvs.map((p) => ({
          id: p.id,
          nome: p.nome,
          documento: p.documento,
          movimento: p.movimento,
          tagCobranca: p.tagCobranca,
        })),
      }));
      setLinhasRio(linhasForProd);

      const prod = buildProducaoClientes(linhasForProd, links);
      setClientesBase(prod);
      setProdExpanded(new Set());
      setProdNovosOpen(false);

      const rawLayout: ProducaoLayoutState = {
        clienteNomes: layoutData.layout?.clienteNomes ?? {},
        pdvPlacements: layoutData.layout?.pdvPlacements ?? [],
        hiddenClienteKeys: layoutData.layout?.hiddenClienteKeys ?? [],
        customClientes: layoutData.layout?.customClientes ?? [],
        acknowledgedPdvs: layoutData.layout?.acknowledgedPdvs ?? [],
        movimentoBaselineEntradaIds: layoutData.layout?.movimentoBaselineEntradaIds ?? [],
        movimentoBaselineSaidaIds: layoutData.layout?.movimentoBaselineSaidaIds ?? [],
      };
      const reconciled = reconcileProducaoLayout(linhasForProd, rawLayout);
      setClienteNomes(rawLayout.clienteNomes);
      setPlacements(rawLayout.pdvPlacements);
      setHiddenClienteKeys(rawLayout.hiddenClienteKeys);
      setCustomClientes(rawLayout.customClientes);
      setAcknowledgedPdvs(reconciled.acknowledgedPdvs ?? rawLayout.acknowledgedPdvs ?? []);
      setMovimentoBaselineEntradaIds(rawLayout.movimentoBaselineEntradaIds ?? []);
      setMovimentoBaselineSaidaIds(rawLayout.movimentoBaselineSaidaIds ?? []);
      setShowHiddenGroups(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar.");
      setRioGrupos([]);
      setClientesBase([]);
    } finally {
      setBusy(false);
    }
  }, []);

  const applyPlayerIdLinks = useCallback(
    (assigned: Array<{ rioPdvKey: string; portalPdvId: number; portalClienteId: number }>) => {
      setLinkMap((prev) => {
        const links = new Map(prev);
        for (const a of assigned) {
          links.set(a.rioPdvKey, {
            portalPdvId: a.portalPdvId,
            portalClienteId: a.portalClienteId,
          });
        }
        setClientesBase(buildProducaoClientes(linhasRio, links));
        return links;
      });
    },
    [linhasRio],
  );

  const activatePdvId = useCallback(async (rioPdvKey: string) => {
    if (activatingPdvKey || activatingBucketKey || provisioningBucketKey) return;
    setActivatingPdvKey(rioPdvKey);
    setMsg("");
    try {
      const res = await fetch("/api/player/portal-ids/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rioPdvKey }),
      });
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        assigned?: Array<{
          rioPdvKey: string;
          portalPdvId: number;
          portalClienteId: number;
          display?: string;
        }>;
        portalClienteId?: number;
        gateway?: { pdvs: number };
      };
      if (!res.ok) throw new Error(data.hint ?? data.error ?? "falha_ativar_id");
      if (data.assigned?.length) applyPlayerIdLinks(data.assigned);
      const item = data.assigned?.find((a) => a.rioPdvKey === rioPdvKey) ?? data.assigned?.[0];
      setMsg(
        item ?
          `Player ${item.display ?? item.portalPdvId} ativo · cliente ${data.portalClienteId ?? item.portalClienteId}.` +
            (data.gateway ? ` Gateway sync OK (${data.gateway.pdvs} PDV).` : "")
        : "ID Player já estava ativo.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao ativar ID.");
    } finally {
      setActivatingPdvKey(null);
    }
  }, [activatingPdvKey, activatingBucketKey, provisioningBucketKey, applyPlayerIdLinks]);

  const activateBucketIds = useCallback(async (bucketKey: string) => {
    if (activatingPdvKey || activatingBucketKey || provisioningBucketKey) return;
    setActivatingBucketKey(bucketKey);
    setMsg("");
    try {
      const res = await fetch("/api/player/portal-ids/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucketKey }),
      });
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        assigned?: Array<{
          rioPdvKey: string;
          portalPdvId: number;
          portalClienteId: number;
          display?: string;
        }>;
        portalClienteId?: number;
        gateway?: { pdvs: number };
      };
      if (!res.ok) throw new Error(data.hint ?? data.error ?? "falha_ativar_id");
      if (data.assigned?.length) applyPlayerIdLinks(data.assigned);
      setMsg(
        `Cliente ${data.portalClienteId ?? "—"} · ${data.assigned?.length ?? 0} ID(s) ativados.` +
          (data.gateway ? ` Gateway sync OK (${data.gateway.pdvs} PDV).` : ""),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao ativar IDs.");
    } finally {
      setActivatingBucketKey(null);
    }
  }, [activatingPdvKey, activatingBucketKey, provisioningBucketKey, applyPlayerIdLinks]);

  const loadPlayerLoginIds = useCallback(() => {
    void fetch("/api/player/portal-ids/player-logins")
      .then((r) => readJsonResponse<{ ok?: boolean; portalClienteIds?: number[] }>(r))
      .then((d) => {
        if (d.ok && d.portalClienteIds) {
          setPlayerLoginClienteIds(new Set(d.portalClienteIds));
        }
      })
      .catch(() => {});
  }, []);

  const provisionClientePlayer = useCallback(async (bucketKey: string, clienteNome: string) => {
    if (activatingPdvKey || activatingBucketKey || provisioningBucketKey) return;

    const ok = window.confirm(
      `Tem certeza que deseja criar o login Player e sincronizar «${clienteNome.trim() || "Cliente"}» no Player 5?\n\n` +
        "Esta ação grava credenciais fixas para o cliente e envia cadastro + login ao gateway.",
    );
    if (!ok) return;

    setProvisioningBucketKey(bucketKey);
    setMsg("");
    try {
      const res = await fetch("/api/player/portal-ids/provision-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucketKey }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        error?: string;
        loginStatus?: "created" | "exists";
        email?: string;
        passwordPlain?: string;
        portalClienteId?: number;
        gateway?: { pdvs: number; clientes: number } | null;
      }>(res);
      if (!res.ok) {
        if (res.status === 409 || data.error === "login_ja_existe") {
          loadPlayerLoginIds();
          throw new Error("Este cliente já possui login Player.");
        }
        throw new Error(data.error ?? "falha_login_player");
      }
      if (data.portalClienteId) {
        setPlayerLoginClienteIds((prev) => new Set([...prev, data.portalClienteId!]));
      }
      const cred =
        data.email && data.passwordPlain ?
          `Login ${data.email} · senha ${data.passwordPlain}`
        : data.email ?
          `Login ${data.email}`
        : "";
      const syncNote =
        data.gateway ?
          ` · sync Player 5 (${data.gateway.pdvs} PDV)`
        : " · cloud2 desabilitado";
      setMsg(
        `${clienteNome.trim() || "Cliente"} ${data.portalClienteId ?? ""}: Player logado.${cred ? ` ${cred}` : ""}${syncNote}`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao criar login Player.");
    } finally {
      setProvisioningBucketKey(null);
    }
  }, [activatingPdvKey, activatingBucketKey, provisioningBucketKey, loadPlayerLoginIds]);

  useEffect(() => {
    void fetch("/api/cadastros/producao-catalog")
      .then((r) => r.json())
      .then((d: { ok?: boolean; rioSourceYearMonth?: number }) => {
        if (d.ok && d.rioSourceYearMonth) setRioSourceYm(d.rioSourceYearMonth);
      })
      .catch(() => {});
    loadPlayerLoginIds();
  }, [loadPlayerLoginIds]);

  useEffect(() => {
    if (rioSourceYm == null) return;
    void loadAll(rioSourceYm);
  }, [rioSourceYm, loadAll]);

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

  function clearRioSelection() {
    setRioSel(null);
    setSelProdPdvId(null);
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

  function togglePdvSelection(rioPdvId: string, checked: boolean) {
    setSelectedPdvIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rioPdvId);
      else next.delete(rioPdvId);
      return next;
    });
  }

  function clearPdvSelection() {
    setSelectedPdvIds(new Set());
  }

  function placementMatchesBatch(o: PdvPlacementOverride, batch: ProducaoPdvRef[]): boolean {
    const batchIds = new Set(batch.map((p) => p.rioPdvId));
    return batchIds.has(o.rioPdvId);
  }

  function movePdvsToCliente(batch: ProducaoPdvRef[], clienteKey: string) {
    if (!batch.length) return;
    const movingIds = new Set(batch.map((p) => p.rioPdvId));
    const nextPlacements: PdvPlacementOverride[] = [
      ...placements.filter((o) => !placementMatchesBatch(o, batch)),
      ...batch.map((pdv) => {
        const linha = linhasRio.find((l) => l.id === pdv.rioLinhaId);
        return {
          rioPdvId: pdv.rioPdvId,
          targetClienteKey: clienteKey,
          rioLinhaId: pdv.rioLinhaId,
          ...(linha?.caPersonId ? { caPersonId: linha.caPersonId } : {}),
        };
      }),
    ];
    const nextHidden = hiddenClienteKeys.filter((k) => k !== clienteKey);
    const nextAck = [...new Set([...acknowledgedPdvs, ...movingIds])];
    applyLayoutChange({
      pdvPlacements: nextPlacements,
      hiddenClienteKeys: nextHidden,
      acknowledgedPdvs: nextAck,
    });
    const destNome = clientes.find((c) => c.key === clienteKey)?.nome ?? "grupo";
    setMsg(
      batch.length === 1 ?
        `PDV «${batch[0]!.nome}» movido para «${destNome}».`
      : `${batch.length} PDVs movidos para «${destNome}».`,
    );
    setSelectedPdvIds((prev) => {
      const next = new Set(prev);
      for (const id of movingIds) next.delete(id);
      return next;
    });
  }

  function onDragStart(ev: DragStartEvent) {
    if (!editMode) return;
    const pdv = ev.active.data.current?.pdv as ProducaoPdvRef | undefined;
    if (!pdv) return;
    const ids =
      selectedPdvIds.has(pdv.rioPdvId) && selectedPdvIds.size > 0 ?
        [...selectedPdvIds]
      : [pdv.rioPdvId];
    const batch = allProdPdvs.filter((p) => ids.includes(p.rioPdvId));
    setDragBatch(batch);
    setDragPdv(batch[0] ?? pdv);
  }

  function onDragEnd(ev: DragEndEvent) {
    const batch = dragBatch;
    setDragPdv(null);
    setDragBatch([]);
    if (!editMode) return;
    const clienteKey = ev.over?.data.current?.clienteKey as string | undefined;
    if (!batch.length || !clienteKey) return;
    movePdvsToCliente(batch, clienteKey);
  }

  const rioPdvTotal = useMemo(() => countRioPlanilhaPdvs(linhasRio), [linhasRio]);
  const prodPdvTotal = useMemo(() => {
    const placed = countProducaoMusicalPdvs(clientes);
    const pending =
      PRODUCAO_MOVIMENTO_TOP_ENABLED ? prodMovimentos.novos.length : 0;
    return placed + pending;
  }, [clientes, prodMovimentos.novos]);
  const pdvCountsMatch = rioPdvTotal === prodPdvTotal && linhasRio.length > 0;
  const pendenciasCount = prodMovimentos.novos.length;

  function expandAllRio() {
    setRioExpanded(new Set(filteredRio.map((g) => g.id)));
    setRioClienteOpen(new Set(filteredRio.flatMap((g) => g.clientes.map((c) => c.id))));
  }

  function collapseAllRio() {
    setRioExpanded(new Set());
    setRioClienteOpen(new Set());
  }

  function expandAllProd() {
    setProdExpanded(new Set(clientesFiltered.map((c) => c.key)));
  }

  function collapseAllProd() {
    setProdExpanded(new Set());
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col">
        <header className="mb-2 shrink-0 px-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cadastros</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Rio (cobrança) × Produção
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            <strong>Esquerda:</strong> espelho da Planilha Rio (somente leitura, competência fixa).{" "}
            <strong>Direita:</strong> produção organizada por você — catálogo único, independente da virada.
          </p>
        </header>

        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 px-1">
          {rioSourceYm != null ?
            <span
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              title="Referência Rio pinada — não muda com a virada de competência"
            >
              Espelho Rio: {formatYearMonthLabel(rioSourceYm)}
            </span>
          : null}
          <input
            className="min-w-[180px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span
            className={
              "text-[11px] font-semibold " +
              (pdvCountsMatch ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")
            }
          >
            PDVs Rio {rioPdvTotal} = Produção {prodPdvTotal}
            {pdvCountsMatch ? " ✓" : " — conferir colunas"}
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
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#C4146A]">
                  Planilha Rio · cobrança
                </p>
                <p className="text-xs text-slate-500">Marca → cliente → PDV (somente leitura)</p>
                <p
                  className={
                    "mt-1 text-sm font-bold " +
                    (pdvCountsMatch ?
                      "text-emerald-800 dark:text-emerald-300"
                    : "text-[#C4146A] dark:text-pink-300")
                  }
                >
                  PDVs na Planilha Rio: {rioPdvTotal}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                  onClick={expandAllRio}
                >
                  Abrir tudo
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                  onClick={collapseAllRio}
                >
                  Fechar tudo
                </button>
              </div>
            </div>
            {rioSel ?
              <div className="flex items-center justify-between gap-2 border-b border-pink-100 bg-pink-50/70 px-3 py-1.5 dark:border-pink-900/40 dark:bg-pink-950/20">
                <p className="min-w-0 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {rioSelLabel}
                  <span className="ml-1 font-normal text-slate-500">
                    · filtrando produção à direita
                  </span>
                </p>
                <button
                  type="button"
                  className="shrink-0 text-xs text-slate-600 hover:underline dark:text-slate-300"
                  onClick={clearRioSelection}
                >
                  Voltar
                </button>
              </div>
            : null}
            <div className="flex-1 overflow-y-auto p-3">
              {PRODUCAO_MOVIMENTO_TOP_ENABLED ?
                <>
                  <CadastrosMovimentoBanner
                    variant="encerrado"
                    title="Encerrados na Planilha Rio"
                    hint="PDVs ou clientes removidos/encerrados na Rio."
                    items={rioTreeMov.encerrados.map((r) => ({
                      key: r.id,
                      label: r.kind === "cliente" ? r.nome : r.nome,
                      sublabel: r.kind === "pdv" ? r.clienteNome : "cliente encerrado",
                      linked: r.portalPlayerId != null,
                    }))}
                  />
                  <CadastrosMovimentoBanner
                    variant="novo"
                    title="Entradas na Planilha Rio"
                    hint="Novos clientes ou PDVs cadastrados na Rio neste mês."
                    items={rioTreeMov.novos.map((r) => ({
                      key: r.id,
                      label: r.nome,
                      sublabel: r.kind === "pdv" ? r.clienteNome : "cliente novo",
                      linked: r.portalPlayerId != null,
                    }))}
                  />
                </>
              : null}
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
                          const linhaTagBg = rioTagCobrancaRowBgClass(c.tagCobranca);
                          return (
                            <div key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                              <button
                                type="button"
                                className={
                                  "flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm font-semibold " +
                                  (active ?
                                    "border-l-[3px] border-l-[#C4146A] bg-pink-50/50 pl-[29px]"
                                  : linhaTagBg ?
                                    linhaTagBg
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
                                <span className="flex-1 truncate">
                                  <RioTagCobrancaNome nome={c.nomeFantasia} tag={c.tagCobranca} />
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {c.linkedCount}/{c.pdvs.length}
                                </span>
                              </button>
                              {cOpen ?
                                c.pdvs.map((p) => (
                                  <div
                                    key={p.id}
                                    className={
                                      "border-t border-slate-50 py-1.5 pl-14 pr-3 text-xs dark:border-slate-800 " +
                                      (rioTagCobrancaRowBgClass(p.tagCobranca) || "text-slate-600")
                                    }
                                  >
                                    📻{" "}
                                    <RioTagCobrancaNome nome={p.nome} tag={p.tagCobranca} />
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
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
                  Produção musical
                </p>
                <p className="text-xs text-slate-500">Cliente → PDVs (sem marca Rio)</p>
                <p
                  className={
                    "mt-1 text-sm font-bold " +
                    (pdvCountsMatch ?
                      "text-emerald-800 dark:text-emerald-300"
                    : "text-violet-800 dark:text-violet-300")
                  }
                >
                  PDVs na Produção: {prodPdvTotal}
                  {pdvCountsMatch ?
                    " ✓"
                  : ` (Rio: ${rioPdvTotal})`}
                  {pendenciasCount > 0 ?
                    <span className="ml-1 text-amber-700 dark:text-amber-400">
                      · {pendenciasCount} pendência{pendenciasCount === 1 ? "" : "s"}
                    </span>
                  : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={
                      "rounded border px-2 py-0.5 text-[10px] " +
                      (onlySemPainel ?
                        "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
                      : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300")
                    }
                    onClick={() => setOnlySemPainel((v) => !v)}
                  >
                    {onlySemPainel ? "Só sem painel ✓" : "Só sem painel"}
                  </button>
                  <button
                    type="button"
                    className={
                      "rounded border px-2 py-0.5 text-[10px] " +
                      (showVinculoDiag ?
                        "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-200"
                      : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300")
                    }
                    onClick={() => setShowVinculoDiag((v) => !v)}
                  >
                    {showVinculoDiag ? "Diagnóstico ✓" : "Diagnóstico vínculos"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    onClick={expandAllProd}
                  >
                    Abrir tudo
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    onClick={collapseAllProd}
                  >
                    Fechar tudo
                  </button>
                </div>
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
                {editMode && selectedPdvIds.size > 0 ?
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-600"
                    onClick={clearPdvSelection}
                  >
                    Limpar seleção ({selectedPdvIds.size})
                  </button>
                : null}
                {editMode ?
                  <>
                    <button
                      type="button"
                      className="rounded-md border border-violet-300 px-2 py-1 text-[11px] font-semibold text-violet-800 dark:border-violet-600 dark:text-violet-200"
                      onClick={addCustomCliente}
                    >
                      + Novo grupo
                    </button>
                  </>
                : null}
                <button
                  type="button"
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-semibold " +
                    (editMode ?
                      "bg-violet-700 text-white"
                    : "border border-violet-300 text-violet-800 dark:border-violet-600 dark:text-violet-200")
                  }
                  onClick={() => {
                    setEditMode((v) => {
                      if (v) clearPdvSelection();
                      return !v;
                    });
                  }}
                >
                  {editMode ? "Edição ativa" : "Editar produção"}
                </button>
              </div>
              {editMode ?
                <p className="mt-1 text-[10px] text-violet-700 dark:text-violet-300">
                  Marque vários PDVs com o checkbox e arraste juntos para outro grupo.
                </p>
              : null}
            </div>
            {showVinculoDiag ?
              <div className="shrink-0 border-b border-violet-200 bg-violet-50/80 px-3 py-2 text-[11px] text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
                <p className="font-semibold">
                  Por que {vinculoDiag.numeroPdvSiteTotal} ≠ {vinculoDiag.vinculosTotal}?
                </p>
                <p className="mt-1 text-violet-800 dark:text-violet-200">
                  A Planilha Rio soma a coluna <strong>Nº PDV</strong> (cobrança). A Lista vínculos só
                  mostra PDVs <strong>registrados</strong> no sistema — um registro por loja.
                </p>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-violet-600 dark:text-violet-300">Nº PDV planilha (cobrança)</dt>
                    <dd className="font-bold tabular-nums">{vinculoDiag.numeroPdvSiteTotal}</dd>
                  </div>
                  <div>
                    <dt className="text-violet-600 dark:text-violet-300">PDVs registrados (lista vínculos)</dt>
                    <dd className="font-bold tabular-nums">{vinculoDiag.vinculosTotal}</dd>
                  </div>
                  <div>
                    <dt className="text-violet-600 dark:text-violet-300">Sem vínculo painel (lista)</dt>
                    <dd className="font-bold tabular-nums">{vinculoDiag.vinculosUnlinked}</dd>
                  </div>
                  <div>
                    <dt className="text-violet-600 dark:text-violet-300">Sem painel na produção</dt>
                    <dd className="font-bold tabular-nums">{vinculoDiag.producaoSemPainel}</dd>
                  </div>
                </dl>
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>{vinculoDiag.semPainelListaVinculos}</strong> sem painel estão na{" "}
                    <a href="/cadastros/vinculos" className="underline">
                      lista vínculos
                    </a>{" "}
                    — dá para vincular lá.
                  </li>
                  <li>
                    <strong>{vinculoDiag.semPainelLinhaProxy}</strong> são{" "}
                    <span className="text-amber-800 dark:text-amber-300">cliente = PDV</span> — aparecem na{" "}
                    <a href="/cadastros/vinculos" className="underline">
                      lista vínculos
                    </a>
                    ; ao vincular, o PDV é criado na Planilha Rio automaticamente.
                  </li>
                  {vinculoDiag.faltamPdvSlots > 0 ?
                    <li>
                      <strong>{vinculoDiag.faltamPdvSlots}</strong> lojas faltando: Nº PDV da cobrança é
                      maior que PDVs cadastrados em{" "}
                      <strong>{vinculoDiag.linhasComFaltamPdv.length}</strong> clientes.
                    </li>
                  : null}
                </ul>
                {vinculoDiag.linhasComFaltamPdv.length > 0 ?
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">
                      Clientes com Nº PDV &gt; lojas cadastradas (
                      {vinculoDiag.linhasComFaltamPdv.length})
                    </summary>
                    <ul className="mt-1 max-h-28 overflow-y-auto pl-2 text-[10px]">
                      {vinculoDiag.linhasComFaltamPdv.slice(0, 40).map((g) => (
                        <li key={g.linhaId}>
                          {g.clienteNome}: Nº PDV {g.numeroPdvSite}, cadastrados{" "}
                          {g.pdvsRegistrados === 0 ? "0 (vira cliente=PDV)" : g.pdvsRegistrados}, faltam{" "}
                          {g.faltam}
                        </li>
                      ))}
                      {vinculoDiag.linhasComFaltamPdv.length > 40 ?
                        <li>… e mais {vinculoDiag.linhasComFaltamPdv.length - 40}</li>
                      : null}
                    </ul>
                  </details>
                : null}
              </div>
            : null}
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-y-auto p-3">
                {PRODUCAO_MOVIMENTO_TOP_ENABLED ?
                  <>
                    {prodMovimentos.encerrados.length > 0 ?
                      <CadastrosMovimentoBanner
                        variant="encerrado"
                        title="Encerrados na produção"
                        hint="Saíram da Planilha Rio — revisar quando aplicável."
                        items={prodMovimentos.encerrados.map((r) => ({
                          key: r.rioPdvId,
                          label: r.nome,
                          sublabel:
                            r.kind === "cliente" ? "cliente encerrado" : (
                              r.rioLinhaNome
                            ),
                          linked: r.portalPlayerId != null,
                        }))}
                        selectedKey={selProdPdvId}
                        onSelect={(key) => setSelProdPdvId(key)}
                      />
                    : null}
                    {prodMovimentos.novos.length > 0 ?
                      <div className="mb-3 overflow-hidden rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-amber-900 dark:text-amber-100"
                          onClick={() => setProdNovosOpen((v) => !v)}
                        >
                          <span className="text-slate-500">{prodNovosOpen ? "▾" : "▸"}</span>
                          <span className="flex-1">
                            Pendências — definir na produção ({prodMovimentos.novos.length})
                          </span>
                        </button>
                        {prodNovosOpen ?
                          <>
                            <p className="border-t border-amber-200 px-3 py-1.5 text-[10px] text-amber-900/90 dark:border-amber-800 dark:text-amber-200/90">
                              {editMode ?
                                "Arraste cada item para o grupo de clientes abaixo. Ao soltar, deixa de ser pendência."
                              : "Ative «Editar produção» para posicionar nos grupos."}
                              {" "}
                              Só entram aqui alterações novas na Planilha Rio após a organização inicial.
                            </p>
                            <div className="space-y-0 border-t border-amber-200 px-2 py-2 dark:border-amber-800">
                              {prodMovimentos.novos.map((item) => (
                                <DraggableProdPdv
                                  key={item.rioPdvId}
                                  pdv={movimentoItemToPdvRef(item)}
                                  editMode={editMode}
                                  tone="pendencia"
                                  selected={selProdPdvId === item.rioPdvId}
                                  multiSelected={selectedPdvIds.has(item.rioPdvId)}
                                  onSelect={() => setSelProdPdvId(item.rioPdvId)}
                                  onToggleMulti={(checked) =>
                                    togglePdvSelection(item.rioPdvId, checked)
                                  }
                                  onActivateId={() => void activatePdvId(item.rioPdvId)}
                                  activating={activatingPdvKey === item.rioPdvId}
                                />
                              ))}
                            </div>
                          </>
                        : null}
                      </div>
                    : null}
                  </>
                : null}
                {clientesFiltered.length === 0 ?
                  <p className="text-sm text-slate-500">Nenhum cliente neste filtro.</p>
                : clientesFiltered.map((c) => {
                    const cOpen = prodExpanded.has(c.key);
                    const highlight =
                      rioSel?.tipo === "cliente" && rioSel.rioLinhaId === c.rioLinhaId;
                    const isEmpty = c.pdvCount === 0;
                    const isHidden =
                      isEmpty && hiddenClienteKeys.includes(c.key) && showHiddenGroups;
                    const clienteTagBg = rioTagCobrancaRowBgClass(c.tagCobranca);
                    return (
                      <div
                        key={c.key}
                        className={
                          "mb-3 overflow-hidden rounded-lg " +
                          (highlight ?
                            "border border-violet-300 dark:border-violet-600"
                          : isHidden ?
                            "border border-dashed border-slate-300 opacity-80 dark:border-slate-600"
                          : clienteTagBg || "border border-slate-200 dark:border-slate-700")
                        }
                      >
                        <div
                          className={
                            "flex flex-wrap items-center gap-2 px-3 py-2 " +
                            (isEmpty ?
                              "bg-slate-100 dark:bg-slate-800/60"
                            : clienteTagBg ? "" : "bg-violet-50 dark:bg-violet-950/30")
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
                          : <span className="flex-1 text-sm font-bold">
                              <RioTagCobrancaNome nome={c.nome} tag={c.tagCobranca} />
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
                          {!editMode && c.pdvs.some((p) => !p.portalPlayerId) ?
                            <button
                              type="button"
                              disabled={
                                activatingBucketKey === c.key ||
                                activatingPdvKey != null ||
                                provisioningBucketKey != null
                              }
                              onClick={() => void activateBucketIds(c.key)}
                              className="rounded border border-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-950/40"
                            >
                              {activatingBucketKey === c.key ? "Ativando…" : "Ativar IDs"}
                            </button>
                          : null}
                          {!editMode && c.pdvs.some((p) => p.portalPlayerId) ?
                            (() => {
                              const portalClienteId = bucketPortalClienteId(c);
                              const hasPlayerLogin =
                                portalClienteId != null && playerLoginClienteIds.has(portalClienteId);
                              if (hasPlayerLogin) {
                                return (
                                  <span
                                    className="rounded border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    title="Login Player já criado para este cliente"
                                  >
                                    Player Logado
                                  </span>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  disabled={
                                    provisioningBucketKey === c.key ||
                                    activatingBucketKey != null ||
                                    activatingPdvKey != null
                                  }
                                  onClick={() => void provisionClientePlayer(c.key, c.nome)}
                                  className="rounded border border-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                  title="Criar login Player e sincronizar só este cliente no Player 5"
                                >
                                  {provisioningBucketKey === c.key ? "Criando…" : "Sem Login"}
                                </button>
                              );
                            })()
                          : null}
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
                                  multiSelected={selectedPdvIds.has(pdv.rioPdvId)}
                                  onSelect={() => setSelProdPdvId(pdv.rioPdvId)}
                                  onToggleMulti={(checked) =>
                                    togglePdvSelection(pdv.rioPdvId, checked)
                                  }
                                  onActivateId={() => void activatePdvId(pdv.rioPdvId)}
                                  activating={activatingPdvKey === pdv.rioPdvId}
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
          <div className="rounded-md border border-violet-300 bg-white px-3 py-2 text-xs shadow-lg dark:bg-slate-900">
            📻{" "}
            {dragBatch.length > 1 ?
              `${dragBatch.length} PDVs selecionados`
            : dragPdv.nome}
          </div>
        : null}
      </DragOverlay>
    </DndContext>
  );
}
