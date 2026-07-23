"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { TAG_SOURCE_LABEL } from "@/lib/criacao/bibliotecaService";
import { LEGACY_MOTIVO_LABEL, type LegacyMotivo } from "@/lib/criacao/legacyMusicaCriteria";
import { isUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { BibliotecaMusicaDragGrip } from "@/components/criacao/BibliotecaMusicaDragGrip";
import { MusicaVotosBadges, MusicaVotosModal } from "@/components/criacao/MusicaVotosModal";

type AutoTag = { fonte: string; chave?: string; valor: string };
type ManualTag = { id: string; nome: string; cor: string; criativoIniciais: string; criativoNome: string };
type TagCriativo = { id: string; nome: string; cor: string; criativoNome: string; usoCount: number };
type FacetTag = TagCriativo;
type ListFilter = "all" | "unused" | "leastUsed" | "legacy";
type ViewMode = "full" | "slim";

const CORES_SUGERIDAS = [
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7",
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#64748b",
];
type Musica = {
  id: string;
  titulo: string;
  artista: string;
  ano: number | null;
  durationMs: number | null;
  isrc: string | null;
  bpm: number | null;
  tom: string | null;
  energia: number | null;
  gravadora: string;
  status: string;
  mixSegundosFinais: number | null;
  tagsManuais: ManualTag[];
  tagsAuto: AutoTag[];
  explicit: boolean;
  explicitDeezer: "sim" | "nao" | "desconhecida" | null;
  explicitMusicbrainz: "sim" | "nao" | "desconhecida" | null;
  explicitGemini: "sim" | "nao" | "desconhecida" | null;
  previewUrl: string | null;
  rejeicoesCount: number;
  likesCount: number;
  dislikesCount: number;
  programacoesCount: number;
  legacyMotivos: LegacyMotivo[];
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Texto preto ou branco conforme a luminância da cor de fundo do chip. */
function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1e293b" : "#ffffff";
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  processando: "Processando",
  revisao_duplicata: "Revisão duplicata",
  pronta: "Pronta",
  erro: "Erro",
};

export type BibliotecaMusicalPanelProps = {
  sidebarMode?: boolean;
  folderFilter?: Record<string, string>;
  folderKind?: "all" | "tag" | "custom" | "especial" | "prog" | "off";
  folderTitle?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  dragMusicaEnabled?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, shiftKey: boolean, metaKey?: boolean) => void;
  onMusicasLoaded?: (ids: string[]) => void;
  refreshToken?: number;
  removePatch?: { token: number; ids: string[] } | null;
};

function emptyFolderCopy(kind: BibliotecaMusicalPanelProps["folderKind"]): {
  title: string;
  desc: string;
} {
  if (kind === "custom") {
    return {
      title: "Pasta vazia",
      desc: "Abra Biblioteca, tags ou programações na barra lateral e arraste faixas (⋮⋮) para cá — ou selecione com Shift/Ctrl+A e solte na pasta à esquerda.",
    };
  }
  if (kind === "tag") {
    return {
      title: "Nenhuma faixa com esta tag",
      desc: "Atribua a tag em outras faixas ou arraste músicas de outras pastas para uma pasta custom.",
    };
  }
  if (kind === "off") {
    return {
      title: "Nenhuma faixa neste OFF",
      desc: "Selecione as faixas e arraste para uma pasta custom (⋮⋮) ou use «Copiar para programação».",
    };
  }
  if (kind === "especial" || kind === "prog") {
    return {
      title: "Nenhuma faixa nesta pasta",
      desc: "Esta visualização é somente leitura. Selecione faixas e copie para pastas custom ou programações.",
    };
  }
  return {
    title: "A biblioteca está vazia",
    desc: "As músicas aparecem aqui depois de passarem pelo Upload e pela Fila de processamento (dedupe, ponto de mix, normalização e tags).",
  };
}

function rowSelectFromEvent(
  onToggleSelect: (id: string, shiftKey: boolean, metaKey?: boolean) => void,
  id: string,
  e: MouseEvent,
) {
  if ((e.target as HTMLElement).closest("button, input, a, label")) return;
  onToggleSelect(id, e.shiftKey, e.metaKey || e.ctrlKey);
}

function slimRowGridClass(hasSelect: boolean, hasDrag: boolean): string {
  if (hasSelect && hasDrag) {
    return "grid-cols-[1.5rem_1.25rem_2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_3.5rem]";
  }
  if (hasSelect) {
    return "grid-cols-[1.5rem_2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_3.5rem]";
  }
  if (hasDrag) {
    return "grid-cols-[1.25rem_2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_3.5rem]";
  }
  return "grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_3.5rem]";
}

function BibliotecaListPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
      <span className="text-xs text-slate-500">
        Mostrando <strong className="text-slate-700 dark:text-slate-200">{from}–{to}</strong> de{" "}
        <strong className="text-slate-700 dark:text-slate-200">{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
        >
          Anterior
        </button>
        <span className="text-xs tabular-nums text-slate-500">
          Página {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function BibliotecaMusicalPanel({
  sidebarMode = false,
  folderFilter,
  folderKind = "all",
  folderTitle,
  viewMode: viewModeProp,
  onViewModeChange,
  dragMusicaEnabled = false,
  selectedIds,
  onToggleSelect,
  onMusicasLoaded,
  refreshToken = 0,
  removePatch = null,
}: BibliotecaMusicalPanelProps = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [musicas, setMusicas] = useState<Musica[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const listAnchorRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [sortBy, setSortBy] = useState<
    "recent" | "artista" | "titulo" | "gravadora" | "programacoes"
  >("recent");
  const [tagIdFilter, setTagIdFilter] = useState<string | null>(null);
  const [gravadoraFilter, setGravadoraFilter] = useState("");
  const [topTags, setTopTags] = useState<FacetTag[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tags, setTags] = useState<TagCriativo[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagFor, setTagFor] = useState<Musica | null>(null);
  const [votosModal, setVotosModal] = useState<{ id: string; titulo: string } | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingTagId, setRefreshingTagId] = useState<string | null>(null);
  const [checkingGeminiId, setCheckingGeminiId] = useState<string | null>(null);
  const [batchGeminiRunning, setBatchGeminiRunning] = useState(false);
  const [rejectFor, setRejectFor] = useState<Musica | null>(null);
  const [renameFor, setRenameFor] = useState<Musica | null>(null);
  const [viewModeInternal, setViewModeInternal] = useState<ViewMode>("full");
  const viewMode = viewModeProp ?? viewModeInternal;
  const setViewMode = onViewModeChange ?? setViewModeInternal;

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch("/api/criacao/tags");
      if (!res.ok) return;
      const data = (await res.json()) as { tags: TagCriativo[] };
      setTags(data.tags);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void loadTags();
    void (async () => {
      try {
        const res = await fetch("/api/criacao/biblioteca/facets");
        if (!res.ok) return;
        const data = (await res.json()) as { topTags?: FacetTag[]; legacyCount?: number };
        setTopTags(data.topTags ?? []);
        setLegacyCount(data.legacyCount ?? 0);
      } catch {
        /* silencioso */
      }
    })();
  }, [loadTags]);

  const pageSize = listFilter === "leastUsed" ? 10 : 200;

  useEffect(() => {
    setPage(1);
  }, [search, status, listFilter, sortBy, tagIdFilter, gravadoraFilter, folderFilter]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (listFilter !== "all") params.set("listFilter", listFilter);
    if (folderFilter?.tagId) params.set("tagId", folderFilter.tagId);
    else if (tagIdFilter) params.set("tagId", tagIdFilter);
    if (folderFilter?.bibliotecaPastaId) params.set("bibliotecaPastaId", folderFilter.bibliotecaPastaId);
    if (folderFilter?.pastaEspecialId) params.set("pastaEspecialId", folderFilter.pastaEspecialId);
    if (folderFilter?.pastaProgramacaoId) params.set("pastaProgramacaoId", folderFilter.pastaProgramacaoId);
    if (folderFilter?.offArquivoId) params.set("offArquivoId", folderFilter.offArquivoId);
    if (listFilter === "all" && sortBy !== "recent") params.set("sortBy", sortBy);
    if (gravadoraFilter.trim()) params.set("gravadora", gravadoraFilter.trim());
    return params.toString();
  }, [search, status, listFilter, sortBy, tagIdFilter, gravadoraFilter, folderFilter, page, pageSize]);

  const goToPage = useCallback((next: number) => {
    setPage(next);
    listAnchorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/biblioteca?${queryString}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { musicas: Musica[]; total: number };
      setMusicas(data.musicas);
      setTotal(data.total);
      onMusicasLoaded?.(data.musicas.map((m) => m.id));
    } catch {
      if (!opts?.silent) setError("Não foi possível carregar a biblioteca.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [queryString, onMusicasLoaded]);

  useEffect(() => {
    if (refreshToken > 0) void load({ silent: true });
  }, [refreshToken, load]);

  useEffect(() => {
    if (!removePatch?.ids.length) return;
    const removed = new Set(removePatch.ids);
    setMusicas((prev) => {
      const next = prev.filter((m) => !removed.has(m.id));
      onMusicasLoaded?.(next.map((m) => m.id));
      return next;
    });
    setTotal((t) => Math.max(0, t - removePatch.ids.length));
  }, [removePatch?.token, removePatch?.ids, onMusicasLoaded]);

  const patchMusica = useCallback(async (musicaId: string) => {
    try {
      const res = await fetch(`/api/criacao/biblioteca/${musicaId}?row=1`);
      if (!res.ok) return;
      const data = (await res.json()) as { musica: Musica };
      if (!data.musica) return;
      setMusicas((prev) => prev.map((m) => (m.id === musicaId ? data.musica : m)));
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const refreshTags = useCallback(
    async (m: Musica) => {
      setRefreshingTagId(m.id);
      setRowMsg(null);
      try {
        const res = await fetch(`/api/criacao/biblioteca/${m.id}/refresh-tags`, { method: "POST" });
        const data = (await res.json().catch(() => null)) as {
          updated?: boolean;
          gravadora?: string;
          isrc?: string | null;
          hint?: string;
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error ?? (res.status === 504 ? "timeout" : "refresh_failed"));
        }
        await patchMusica(m.id);
        const isrc = data?.isrc?.trim();
        if (isrc) {
          setRowMsg(`«${m.titulo}» — ISRC ${isrc}${data?.gravadora ? ` · ${data.gravadora}` : ""}.`);
        } else if (data?.updated) {
          setRowMsg(`«${m.titulo}» — ${data.hint ?? "Tags atualizadas."}`);
        } else {
          setRowMsg(`«${m.titulo}» — ${data?.hint ?? "Nenhum ISRC/gravadora novo encontrado."}`);
        }
      } catch (e) {
        setRowMsg(e instanceof Error ? e.message : "Falha ao buscar tags na internet.");
      } finally {
        setRefreshingTagId(null);
      }
    },
    [patchMusica],
  );

  const checkGeminiOne = useCallback(
    async (m: Musica) => {
      setCheckingGeminiId(m.id);
      setRowMsg(null);
      try {
        const res = await fetch("/api/criacao/biblioteca/check-explicit/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ musicaIds: [m.id], onlyMissing: false, limit: 1 }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          geminiLastError?: string;
          results?: {
            musicaId: string;
            geminiStatus?: "sim" | "nao" | "desconhecida";
            geminiFailed?: boolean;
            geminiError?: string;
            explicit?: boolean;
          }[];
        } | null;
        if (!res.ok) {
          if (res.status === 504) throw new Error("Timeout do servidor (504) — tente IA em uma faixa por vez.");
          if (data?.error === "gemini_desabilitado") throw new Error("Configure GEMINI_API_KEY no Netlify.");
          throw new Error(data?.error ?? "check_failed");
        }
        await patchMusica(m.id);
        const r = data?.results?.[0];
        const titulo = m.titulo || "(sem título)";
        if (r?.geminiFailed) {
          const detail = r.geminiError ?? data?.geminiLastError ?? "sem resposta";
          setRowMsg(`«${titulo}» — Gemini falhou (${detail}). Tente de novo em alguns segundos.`);
          return;
        }
        const st = r?.geminiStatus;
        if (st === "sim") {
          setRowMsg(`«${titulo}» — EXP (letra explícita).`);
        } else if (st === "nao") {
          setRowMsg(`«${titulo}» — IA ok (letra limpa para rádio).`);
        } else if (st === "desconhecida") {
          setRowMsg(`«${titulo}» — IA não conhece esta faixa (artista+título).`);
        } else {
          setRowMsg(`Check IA concluído para «${titulo}».`);
        }
      } catch (e) {
        setRowMsg(e instanceof Error ? e.message : "Falha no check IA desta faixa.");
      } finally {
        setCheckingGeminiId(null);
      }
    },
    [patchMusica],
  );

  const checkGeminiBatch = useCallback(async () => {
    if (batchGeminiRunning) return;
    setBatchGeminiRunning(true);
    setRowMsg(null);
    let total = 0;
    let expCount = 0;
    let okCount = 0;
    let unkCount = 0;
    let failTotal = 0;
    let lastGeminiErr: string | undefined;
    try {
      while (true) {
        const res = await fetch("/api/criacao/biblioteca/check-explicit/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onlyMissing: true, limit: 1 }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          processed?: number;
          hasMore?: boolean;
          geminiLastError?: string;
          results?: { geminiStatus?: "sim" | "nao" | "desconhecida"; geminiFailed?: boolean }[];
          geminiFailed?: number;
        } | null;
        if (!res.ok) {
          if (res.status === 504) throw new Error("Timeout do servidor (504) — tente IA em uma faixa por vez.");
          if (data?.error === "gemini_desabilitado") throw new Error("Configure GEMINI_API_KEY no Netlify.");
          throw new Error(data?.error ?? "check_failed");
        }
        const n = data?.processed ?? 0;
        for (const r of data?.results ?? []) {
          if (r.geminiFailed) continue;
          if (r.geminiStatus === "sim") expCount += 1;
          else if (r.geminiStatus === "nao") okCount += 1;
          else if (r.geminiStatus === "desconhecida") unkCount += 1;
        }
        total += n;
        failTotal += data?.geminiFailed ?? 0;
        if (data?.geminiLastError) lastGeminiErr = data.geminiLastError;
        if (n > 0) {
          setRowMsg(
            `IA em lote: ${total} faixa${total === 1 ? "" : "s"}… (${expCount} EXP · ${okCount} ok · ${unkCount} ?${failTotal ? ` · ${failTotal} falha API` : ""})`,
          );
        }
        if (!data?.hasMore || n === 0) break;
        if ((data?.geminiFailed ?? 0) > 0) break;
      }
      await load({ silent: true });
      setRowMsg(
        total > 0 ?
          `IA em lote concluída — ${total} faixa${total === 1 ? "" : "s"}: ${expCount} EXP · ${okCount} IA ok · ${unkCount} desconhecida${failTotal > 0 ? ` · ${failTotal} falha Gemini${lastGeminiErr ? ` (${lastGeminiErr})` : ""}` : ""}.`
        : "Nenhuma faixa pendente de avaliação IA.",
      );
    } catch (e) {
      setRowMsg(e instanceof Error ? e.message : "Falha no lote IA.");
    } finally {
      setBatchGeminiRunning(false);
    }
  }, [batchGeminiRunning, load]);

  const apagarMusica = useCallback(
    async (m: Musica) => {
      let pastasCount = 0;
      let programacoesCount = 0;
      try {
        const res = await fetch(`/api/criacao/biblioteca/${m.id}`);
        if (res.ok) {
          const info = (await res.json()) as { pastasCount?: number; programacoesCount?: number };
          pastasCount = info.pastasCount ?? 0;
          programacoesCount = info.programacoesCount ?? 0;
        }
      } catch {
        /* preview opcional */
      }

      const avisoPastas =
        pastasCount > 0 ?
          `\n\nEstá em ${pastasCount} pasta(s) de ${programacoesCount} programação(ões) — será removida delas também.`
        : "";

      if (
        !window.confirm(
          `Apagar «${m.titulo || "sem título"}» — ${m.artista || "—"}?${avisoPastas}\n\nRemove metadados e arquivos no servidor. Não dá para desfazer.`,
        )
      ) {
        return;
      }

      setDeletingId(m.id);
      setError(null);
      try {
        const res = await fetch(`/api/criacao/biblioteca/${m.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete_failed");
        setMusicas((prev) => prev.filter((x) => x.id !== m.id));
        setTotal((t) => Math.max(0, t - 1));
      } catch {
        setError("Não foi possível apagar a música.");
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const apagarTodasLegadas = useCallback(async () => {
    let emProgramacoes = 0;
    let emPastas = 0;
    let legacyTotal = legacyCount;
    try {
      const res = await fetch("/api/criacao/biblioteca/bulk-delete");
      if (res.ok) {
        const stats = (await res.json()) as {
          total?: number;
          emProgramacoes?: number;
          emPastas?: number;
        };
        legacyTotal = stats.total ?? legacyCount;
        emProgramacoes = stats.emProgramacoes ?? 0;
        emPastas = stats.emPastas ?? 0;
      }
    } catch {
      /* preview opcional */
    }

    const avisoProg =
      emProgramacoes > 0 ?
        `\n\n${legacyTotal} faixa(s) legada(s) · ${emPastas} pasta(s) em ${emProgramacoes} programação(ões) — serão removidas delas também.`
      : "";

    if (
      !window.confirm(
        `Apagar TODAS as ${legacyTotal} faixa(s) legadas (pipeline antigo, sem 128 mono / LUFS / master)?${avisoProg}\n\nRemove metadados e arquivos no servidor. Não dá para desfazer.`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/criacao/biblioteca/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "legacy" }),
      });
      if (!res.ok) throw new Error("bulk_delete_failed");
      const data = (await res.json()) as { deleted?: number; failed?: number };
      try {
        const facetsRes = await fetch("/api/criacao/biblioteca/facets");
        if (facetsRes.ok) {
          const facets = (await facetsRes.json()) as { legacyCount?: number };
          setLegacyCount(facets.legacyCount ?? 0);
        } else {
          setLegacyCount(0);
        }
      } catch {
        setLegacyCount(0);
      }
      setListFilter("all");
      await load({ silent: true });
      setRowMsg(
        `Removidas ${data.deleted ?? 0} faixa(s) legada(s)` +
          (data.failed ? ` · ${data.failed} falha(s)` : "") +
          ".",
      );
    } catch {
      setError("Não foi possível apagar as faixas legadas.");
    } finally {
      setBulkDeleting(false);
    }
  }, [legacyCount, load]);

  function LegacyBadge({ motivos }: { motivos: LegacyMotivo[] }) {
    if (motivos.length === 0) return null;
    return (
      <span
        className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-900 dark:bg-orange-950 dark:text-orange-200"
        title={`Pipeline antigo: ${motivos.map((m) => LEGACY_MOTIVO_LABEL[m]).join(" · ")}`}
      >
        legado · {motivos.map((m) => LEGACY_MOTIVO_LABEL[m]).join(" · ")}
      </span>
    );
  }

  return (
    <div className={sidebarMode ? "" : "mx-auto max-w-[1300px] px-3 py-6 sm:px-4"}>
      {!sidebarMode ?
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Criação / Biblioteca musical
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca musical</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Acervo canônico — tags DZ/MB no upload · ↻ e IA por faixa · busca instantânea.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
            role="group"
            aria-label="Modo de listagem"
          >
            <button
              type="button"
              onClick={() => setViewMode("full")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "full" ?
                  "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Completa
            </button>
            <button
              type="button"
              onClick={() => setViewMode("slim")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "slim" ?
                  "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Lista slim
            </button>
          </div>
          <button
            type="button"
            disabled={batchGeminiRunning || checkingGeminiId != null}
            onClick={() => void checkGeminiBatch()}
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200 dark:hover:bg-violet-900"
            title="Avalia conteúdo explícito (Gemini) em faixas ainda sem check IA — 5 por vez"
          >
            {batchGeminiRunning ? "IA em lote…" : "IA EXP em lote"}
          </button>
          <button
            type="button"
            onClick={() => setShowTagManager(true)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            🏷 Gerenciar tags
          </button>
          <div className="text-right text-xs text-slate-500">
            <strong className="text-slate-700 dark:text-slate-200">{total}</strong> música{total === 1 ? "" : "s"}
            {total > pageSize ?
              <span className="block text-[10px] font-normal text-slate-400">
                {pageSize} por página · use Anterior/Próxima abaixo da lista
              </span>
            : null}
          </div>
        </div>
      </div>
      : null}

      {rowMsg ?
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {rowMsg}
        </div>
      : null}

      {listFilter === "legacy" ?
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900 dark:bg-orange-950/40">
          <div className="text-sm text-orange-950 dark:text-orange-100">
            <strong>Faixas legadas</strong> — uploads anteriores ao pipeline atual (128 kbps mono, LUFS, master).
            Ordenadas da mais antiga para a mais recente. Podem causar erro ou descompasso no player.
          </div>
          {legacyCount > 0 ?
            <button
              type="button"
              disabled={bulkDeleting}
              onClick={() => void apagarTodasLegadas()}
              className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
            >
              {bulkDeleting ? "Apagando…" : `Apagar todas as legadas (${legacyCount})`}
            </button>
          : null}
        </div>
      : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Título, artista, tag, BPM, ISRC…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">Todos</option>
            <option value="pronta">Pronta</option>
            <option value="processando">Processando</option>
            <option value="revisao_duplicata">Revisão duplicata</option>
            <option value="pendente">Pendente</option>
            <option value="erro">Erro</option>
          </select>
        </label>
        <label className="min-w-[160px] text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Gravadora</span>
          <input
            type="search"
            value={gravadoraFilter}
            onChange={(e) => setGravadoraFilter(e.target.value)}
            placeholder="Filtrar gravadora…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Ordenar</span>
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as "recent" | "artista" | "titulo" | "gravadora" | "programacoes",
              )
            }
            disabled={listFilter !== "all"}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 disabled:opacity-50"
          >
            <option value="recent">Mais recentes</option>
            <option value="artista">{viewMode === "slim" ? "Banda" : "Artista"}</option>
            <option value="titulo">{viewMode === "slim" ? "Música" : "Música"}</option>
            <option value="gravadora">Gravadora</option>
            <option value="programacoes">Uso em programações</option>
          </select>
        </label>
      </form>

      {!sidebarMode ?
        <div className="mb-4 space-y-2">
        {topTags.length > 0 ?
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Top tags</span>
            {topTags.map((t) => {
              const active = tagIdFilter === t.id && listFilter === "all";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setListFilter("all");
                    setTagIdFilter(active ? null : t.id);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm transition ${
                    active ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : "opacity-90 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: t.cor, color: readableText(t.cor) }}
                  title={`${t.criativoNome ? `[${t.criativoNome}] ` : ""}${t.nome} · ${t.usoCount} prog.`}
                >
                  {t.criativoNome ? `[${t.criativoNome}] ` : ""}
                  {t.nome}
                </button>
              );
            })}
          </div>
        : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTagIdFilter(null);
              setListFilter(listFilter === "unused" ? "all" : "unused");
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              listFilter === "unused" ?
                "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            Músicas não usadas em clientes
          </button>
          <button
            type="button"
            onClick={() => {
              setTagIdFilter(null);
              setListFilter(listFilter === "leastUsed" ? "all" : "leastUsed");
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              listFilter === "leastUsed" ?
                "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            Top 10 menos usadas
          </button>
          <button
            type="button"
            onClick={() => {
              setTagIdFilter(null);
              setListFilter(listFilter === "legacy" ? "all" : "legacy");
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              listFilter === "legacy" ?
                "border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            Legado · sem pipeline novo{legacyCount > 0 ? ` (${legacyCount})` : ""}
          </button>
          {(tagIdFilter || listFilter !== "all" || gravadoraFilter.trim()) ?
            <button
              type="button"
              onClick={() => {
                setTagIdFilter(null);
                setListFilter("all");
                setGravadoraFilter("");
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700"
            >
              Limpar filtros
            </button>
          : null}
        </div>
        </div>
      : null}

      {loading && musicas.length === 0 ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : musicas.length === 0 ?
        (() => {
          const empty = emptyFolderCopy(folderKind);
          return (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-16 text-center dark:border-slate-700">
          <div className="text-3xl">🎵</div>
          <div className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {empty.title}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {empty.desc}
          </p>
        </div>
          );
        })()
      : <div
          ref={listAnchorRef}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {viewMode === "slim" ?
            <>
              <div className={`grid gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 ${slimRowGridClass(!!onToggleSelect, dragMusicaEnabled)}`}>
                {onToggleSelect ? <span /> : null}
                {dragMusicaEnabled ? <span /> : null}
                <span />
                <span>Música</span>
                <span>Banda</span>
                <span>Tag criativo</span>
                <span className="text-right">⏱</span>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {musicas.map((m) => (
                  <li
                    key={m.id}
                    onClick={(e) => {
                      if (onToggleSelect) rowSelectFromEvent(onToggleSelect, m.id, e);
                    }}
                    className={`grid items-center gap-2 px-3 py-1 ${slimRowGridClass(!!onToggleSelect, dragMusicaEnabled)} ${selectedIds?.has(m.id) ? "bg-violet-50 dark:bg-violet-950/30" : ""} ${onToggleSelect ? "cursor-pointer select-none" : ""}`}
                  >
                    {onToggleSelect ?
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(m.id) ?? false}
                        readOnly
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(m.id, e.shiftKey, true);
                        }}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        aria-label={`Selecionar ${m.titulo}`}
                      />
                    : null}
                    {dragMusicaEnabled ?
                      <BibliotecaMusicaDragGrip
                        musicaId={m.id}
                        titulo={m.titulo || "(sem título)"}
                        selectedIds={selectedIds}
                      />
                    : null}
                    {m.previewUrl ?
                      <MusicaPreviewButton
                        track={{
                          id: m.id,
                          titulo: m.titulo,
                          artista: m.artista,
                          previewUrl: m.previewUrl,
                          durationMs: m.durationMs,
                        }}
                        className="h-7 w-7 text-sm"
                      />
                    : <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-xs text-slate-300 dark:bg-slate-800">
                        🎵
                      </div>
                    }
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                      <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                        {m.titulo || "(sem título)"}
                      </span>
                      {m.legacyMotivos.length > 0 ?
                        <span className="text-[9px] font-semibold text-orange-700 dark:text-orange-300">
                          legado
                        </span>
                      : null}
                      <MusicaVotosBadges
                        musicaId={m.id}
                        titulo={m.titulo || "(sem título)"}
                        likes={m.likesCount}
                        dislikes={m.dislikesCount}
                        onOpen={(id, titulo) => setVotosModal({ id, titulo })}
                      />
                    </div>
                    <div className="min-w-0 truncate text-xs text-slate-500">{m.artista || "—"}</div>
                    <div className="flex min-w-0 flex-wrap items-center gap-0.5 overflow-hidden">
                      {m.tagsManuais.length === 0 ?
                        <span className="truncate text-[11px] text-slate-400">—</span>
                      : m.tagsManuais.map((t) => (
                          <span
                            key={t.id}
                            className={
                              "inline-flex max-w-full truncate rounded font-bold " +
                              (isUploadCompetenciaTag(t.nome) ?
                                "px-1 py-0 text-[7px] opacity-90"
                              : "px-1.5 py-0 text-[9px]")
                            }
                            style={{ background: t.cor, color: readableText(t.cor) }}
                            title={t.criativoNome ? `${t.criativoNome} · ${t.nome}` : t.nome}
                          >
                            {t.criativoIniciais ? `[${t.criativoIniciais}] ` : ""}
                            {t.nome}
                          </span>
                        ))
                      }
                    </div>
                    <div className="text-right text-[11px] tabular-nums text-slate-500">
                      {formatDuration(m.durationMs)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          : <>
          <div className={`hidden gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 lg:grid ${
            dragMusicaEnabled ?
              "grid-cols-[1.25rem_40px_1fr_1.6fr_48px_120px_60px_60px]"
            : "grid-cols-[40px_1fr_1.6fr_48px_120px_60px_60px]"
          }`}>
            {dragMusicaEnabled ? <span /> : null}
            <span />
            <span>Título</span>
            <span>Tags</span>
            <span className="text-center" title="Programações em que a faixa aparece">Prog</span>
            <span>Gravadora</span>
            <span className="text-center">BPM</span>
            <span className="text-right">⏱</span>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {musicas.map((m) => (
              <li
                key={m.id}
                onClick={(e) => {
                  if (onToggleSelect) rowSelectFromEvent(onToggleSelect, m.id, e);
                }}
                className={`grid gap-3 px-4 py-3 lg:items-center ${
                  dragMusicaEnabled ?
                    "lg:grid-cols-[1.25rem_40px_1fr_1.6fr_48px_120px_60px_60px]"
                  : "lg:grid-cols-[40px_1fr_1.6fr_48px_120px_60px_60px]"
                } ${selectedIds?.has(m.id) ? "bg-violet-50 dark:bg-violet-950/30" : ""} ${onToggleSelect ? "cursor-pointer select-none" : ""}`}
              >
                {dragMusicaEnabled ?
                  <BibliotecaMusicaDragGrip
                    musicaId={m.id}
                    titulo={m.titulo || "(sem título)"}
                    selectedIds={selectedIds}
                  />
                : null}
                {m.previewUrl ?
                  <MusicaPreviewButton
                    track={{
                      id: m.id,
                      titulo: m.titulo,
                      artista: m.artista,
                      previewUrl: m.previewUrl,
                      durationMs: m.durationMs,
                    }}
                    className="h-9 w-9 text-base"
                  />
                : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-base text-slate-300 dark:bg-slate-800">
                    🎵
                  </div>
                }
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {m.titulo || "(sem título)"}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {m.artista || "—"}
                    {m.ano ? ` · ${m.ano}` : ""}
                    {m.status !== "pronta" ?
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    : null}
                    <LegacyBadge motivos={m.legacyMotivos} />
                    {m.rejeicoesCount > 0 ?
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                        rejeitada ×{m.rejeicoesCount}
                      </span>
                    : null}
                    <MusicaVotosBadges
                      musicaId={m.id}
                      titulo={m.titulo || "(sem título)"}
                      likes={m.likesCount}
                      dislikes={m.dislikesCount}
                      onOpen={(id, titulo) => setVotosModal({ id, titulo })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ExplicitApiChip fonte="DZ" status={m.explicitDeezer} />
                  <ExplicitApiChip fonte="MB" status={m.explicitMusicbrainz} />
                  <ExplicitApiChip fonte="IA" status={m.explicitGemini} />
                  {m.tagsManuais.map((t) => (
                    <span
                      key={t.id}
                      className={
                        "inline-flex rounded font-bold " +
                        (isUploadCompetenciaTag(t.nome) ? "px-1 py-0 text-[8px] opacity-90" : "px-2 py-0.5 text-[10px]")
                      }
                      style={{ background: t.cor, color: readableText(t.cor) }}
                      title={t.criativoNome ? `${t.criativoNome} · ${t.nome}` : t.nome}
                    >
                      {t.criativoIniciais ? `[${t.criativoIniciais}] ` : ""}
                      {t.nome}
                    </span>
                  ))}
                  {m.energia != null ?
                    <AutoChip fonte="local" valor={`Energia ${Math.round(m.energia * 100)}`} />
                  : null}
                  {m.tagsAuto.map((t, i) => (
                    <AutoChip key={`${t.fonte}-${i}`} fonte={t.fonte} valor={t.valor} />
                  ))}
                  {m.tagsManuais.length === 0 &&
                  m.tagsAuto.length === 0 &&
                  m.energia == null &&
                  !m.explicitDeezer &&
                  !m.explicitMusicbrainz &&
                  !m.explicitGemini ?
                    <span className="text-[11px] text-slate-400">sem tags</span>
                  : null}
                  <button
                    type="button"
                    onClick={() => setRenameFor(m)}
                    title="Renomear título e artista"
                    className="inline-flex h-5 items-center rounded border border-dashed border-slate-300 px-1.5 text-[10px] font-bold text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => setTagFor(m)}
                    title="Tags criativas"
                    className="inline-flex h-5 items-center rounded border border-dashed border-slate-300 px-1.5 text-[10px] font-bold text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600"
                  >
                    + tag
                  </button>
                  <button
                    type="button"
                    disabled={refreshingTagId === m.id}
                    onClick={() => void refreshTags(m)}
                    title="Buscar tags na internet (gravadora + DZ/MB)"
                    className="inline-flex h-5 items-center rounded border border-dashed border-indigo-200 px-1.5 text-[10px] font-bold text-indigo-400 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50 dark:border-indigo-900"
                  >
                    {refreshingTagId === m.id ? "…" : "↻"}
                  </button>
                  <button
                    type="button"
                    disabled={checkingGeminiId === m.id}
                    onClick={() => void checkGeminiOne(m)}
                    title="Check letras (IA) — EXP vermelho"
                    className="inline-flex h-5 items-center rounded border border-dashed border-red-200 px-1.5 text-[10px] font-bold text-red-400 hover:border-red-400 hover:text-red-600 disabled:opacity-50 dark:border-red-900"
                  >
                    {checkingGeminiId === m.id ? "…" : "IA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectFor(m)}
                    title="Rejeitar faixa (Wizard IA evita)"
                    className="inline-flex h-5 items-center rounded border border-dashed border-red-200 px-1.5 text-[10px] font-bold text-red-400 hover:border-red-400 hover:text-red-600 dark:border-red-900"
                  >
                    🚫
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === m.id}
                    onClick={() => void apagarMusica(m)}
                    title="Apagar da biblioteca e do servidor"
                    className="inline-flex h-5 items-center rounded border border-dashed border-slate-300 px-1.5 text-[10px] font-bold text-slate-400 hover:border-red-400 hover:text-red-600 disabled:opacity-50 dark:border-slate-600"
                  >
                    {deletingId === m.id ? "…" : "🗑"}
                  </button>
                </div>
                <div
                  className="text-center text-xs tabular-nums text-slate-600 dark:text-slate-300"
                  title={`Em ${m.programacoesCount} programação(ões)`}
                >
                  {m.programacoesCount > 0 ? m.programacoesCount : "—"}
                </div>
                <div className="truncate text-xs text-slate-500">{m.gravadora || "—"}</div>
                <div className="text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  {m.bpm ?? "—"}
                </div>
                <div className="text-right text-xs tabular-nums text-slate-500">
                  {formatDuration(m.durationMs)}
                </div>
              </li>
            ))}
          </ul>
          </>
          }
          <BibliotecaListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={goToPage}
          />
        </div>
      }

      {showTagManager ?
        <TagManagerModal
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onChanged={async () => {
            await loadTags();
            await load({ silent: true });
          }}
        />
      : null}

      {tagFor ?
        <TagAssignModal
          musica={tagFor}
          tags={tags}
          onClose={() => setTagFor(null)}
          onChanged={async () => {
            await loadTags();
            await load({ silent: true });
          }}
        />
      : null}

      {rejectFor ?
        <RejeicaoModal
          musica={rejectFor}
          onClose={() => setRejectFor(null)}
          onChanged={load}
        />
      : null}

      {renameFor ?
        <RenameMusicaModal
          musica={renameFor}
          onClose={() => setRenameFor(null)}
          onChanged={async () => {
            await load({ silent: true });
          }}
        />
      : null}

      <MusicaVotosModal
        musicaId={votosModal?.id ?? null}
        titulo={votosModal?.titulo ?? ""}
        onClose={() => setVotosModal(null)}
      />
    </div>
  );
}

function TagManagerModal({
  tags,
  onClose,
  onChanged,
}: {
  tags: TagCriativo[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES_SUGERIDAS[0]);
  const [busy, setBusy] = useState(false);

  async function criar() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/criacao/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), cor }),
      });
      setNome("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function recolor(id: string, novaCor: string) {
    await fetch(`/api/criacao/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cor: novaCor }),
    });
    await onChanged();
  }

  async function remover(id: string) {
    if (!confirm("Excluir esta tag de todas as músicas?")) return;
    await fetch(`/api/criacao/tags/${id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold">Tags criativas</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold text-slate-500">Nova tag</div>
          <div className="flex items-center gap-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void criar()}
              placeholder="Ex.: Lounge Style (Lauro)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={() => void criar()}
              disabled={busy || !nome.trim()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              Criar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CORES_SUGERIDAS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={`h-6 w-6 rounded-full border-2 ${cor === c ? "border-slate-900 dark:border-white" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {tags.length === 0 ?
            <div className="py-8 text-center text-sm text-slate-400">Nenhuma tag criada ainda.</div>
          : <ul className="space-y-1">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className="inline-flex rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: t.cor, color: readableText(t.cor) }}>
                    {t.nome}
                  </span>
                  <span className="text-xs text-slate-400">{t.usoCount} uso{t.usoCount === 1 ? "" : "s"}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {CORES_SUGERIDAS.slice(0, 7).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => void recolor(t.id, c)}
                        className="h-4 w-4 rounded-full border border-white/40"
                        style={{ background: c }}
                        aria-label={`cor ${c}`}
                      />
                    ))}
                    <button type="button" onClick={() => void remover(t.id)} className="ml-1 text-slate-300 hover:text-red-600" title="Excluir">🗑</button>
                  </div>
                </li>
              ))}
            </ul>
          }
        </div>
      </div>
    </div>
  );
}

function RenameMusicaModal({
  musica,
  onClose,
  onChanged,
}: {
  musica: Musica;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [titulo, setTitulo] = useState(musica.titulo || "");
  const [artista, setArtista] = useState(musica.artista || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!titulo.trim()) {
      setErr("Informe o título");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/criacao/biblioteca/${musica.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), artista: artista.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error === "titulo_obrigatorio" ? "Informe o título" : "Não foi possível salvar");
        return;
      }
      await onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="text-sm font-bold">Renomear faixa</div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Artista</span>
            <input
              value={artista}
              onChange={(e) => setArtista(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagAssignModal({
  musica,
  tags,
  onClose,
  onChanged,
}: {
  musica: Musica;
  tags: TagCriativo[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [assigned, setAssigned] = useState<Set<string>>(new Set(musica.tagsManuais.map((t) => t.id)));
  const [busy, setBusy] = useState(false);

  async function toggle(tagId: string) {
    if (busy) return;
    setBusy(true);
    const has = assigned.has(tagId);
    try {
      if (has) {
        await fetch(`/api/criacao/musicas/${musica.id}/tags/${tagId}`, { method: "DELETE" });
        setAssigned((prev) => {
          const n = new Set(prev);
          n.delete(tagId);
          return n;
        });
      } else {
        await fetch(`/api/criacao/musicas/${musica.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId }),
        });
        setAssigned((prev) => new Set(prev).add(tagId));
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{musica.titulo || "(sem título)"}</div>
            <div className="truncate text-xs text-slate-500">{musica.artista}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4">
          {tags.length === 0 ?
            <div className="text-sm text-slate-400">
              Nenhuma tag criada. Use “Gerenciar tags” para criar.
            </div>
          : <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = assigned.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void toggle(t.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${on ? "" : "opacity-40 grayscale hover:opacity-70"}`}
                    style={{ background: t.cor, color: readableText(t.cor) }}
                  >
                    {on ? "✓ " : ""}{t.nome}
                  </button>
                );
              })}
            </div>
          }
        </div>
      </div>
    </div>
  );
}

function RejeicaoModal({
  musica,
  onClose,
  onChanged,
}: {
  musica: Musica;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  type Cliente = { ref: string; nome: string };
  type Rej = { id: string; clienteRef: string; motivo: string };

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [rejeicoes, setRejeicoes] = useState<Rej[]>([]);
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rc, rr] = await Promise.all([
      fetch("/api/criacao/clientes"),
      fetch(`/api/criacao/musicas/${musica.id}/rejeicoes`),
    ]);
    if (rc.ok) setClientes(((await rc.json()) as { clientes: Cliente[] }).clientes ?? []);
    if (rr.ok) setRejeicoes(((await rr.json()) as { rejeicoes: Rej[] }).rejeicoes ?? []);
  }, [musica.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const rejRefs = new Set(rejeicoes.map((r) => r.clienteRef));
    return clientes
      .filter((c) => !rejRefs.has(c.ref))
      .filter((c) => !q || c.nome.toLowerCase().includes(q))
      .slice(0, 30);
  }, [clientes, rejeicoes, busca]);

  async function rejeitar(clienteRef: string) {
    setBusy(true);
    try {
      await fetch(`/api/criacao/musicas/${musica.id}/rejeicoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteRef, motivo: motivo.trim() }),
      });
      setBusca("");
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remover(clienteRef: string) {
    setBusy(true);
    try {
      await fetch(
        `/api/criacao/musicas/${musica.id}/rejeicoes?clienteRef=${encodeURIComponent(clienteRef)}`,
        { method: "DELETE" },
      );
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">Rejeitar faixa</div>
            <div className="truncate text-xs text-slate-500">
              {musica.artista} — {musica.titulo}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <p className="mb-3 text-xs text-slate-500">
            Faixas rejeitadas são evitadas pelo Wizard IA. Marque por cliente quando uma gravação não serve
            para aquele ponto de venda.
          </p>
          {rejeicoes.length > 0 ?
            <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {rejeicoes.map((r) => {
                const nome = clientes.find((c) => c.ref === r.clienteRef)?.nome ?? r.clienteRef;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{nome}</div>
                      {r.motivo ?
                        <div className="truncate text-xs text-slate-400">{r.motivo}</div>
                      : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remover(r.clienteRef)}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700"
                    >
                      remover
                    </button>
                  </li>
                );
              })}
            </ul>
          : null}
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente para rejeitar…"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            {filtrados.map((c) => (
              <li key={c.ref}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void rejeitar(c.ref)}
                  className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {c.nome}
                </button>
              </li>
            ))}
            {filtrados.length === 0 ?
              <li className="px-3 py-4 text-center text-xs text-slate-400">Nenhum cliente disponível.</li>
            : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ExplicitApiChip({
  fonte,
  status,
}: {
  fonte: "DZ" | "MB" | "IA";
  status: "sim" | "nao" | "desconhecida" | null;
}) {
  if (status == null) return null;

  if (fonte === "IA" && status === "sim") {
    return (
      <span
        className="inline-flex rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"
        title="IA (Gemini): letra explícita — ou confirmado via Deezer/MusicBrainz"
      >
        EXP
      </span>
    );
  }

  const label =
    fonte === "IA" ?
      status === "nao" ? "IA ok"
      : "IA ?"
    : status === "sim" ? `${fonte} explicit`
    : status === "nao" ? `${fonte} ok`
    : `${fonte} ?`;

  const cls =
    fonte === "IA" && status === "nao" ?
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : status === "sim" ?
      "border-orange-400 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200"
    : status === "nao" ?
      "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
    : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900";

  const title =
    fonte === "DZ" ?
      status === "sim" ? "Deezer: explicit_lyrics"
      : status === "nao" ? "Deezer: não explícita"
      : "Deezer: faixa não encontrada"
    : fonte === "MB" ?
      status === "sim" ? "MusicBrainz: tag explicit"
      : status === "nao" ? "MusicBrainz: sem tag explicit"
      : "MusicBrainz: gravação não encontrada"
    : status === "nao" ? "IA (Gemini): letra OK"
    : "IA (Gemini): faixa desconhecida";

  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${cls}`} title={title}>
      {label}
    </span>
  );
}

function AutoChip({ fonte, valor }: { fonte: string; valor: string }) {
  const prefix = TAG_SOURCE_LABEL[fonte] ?? fonte.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <span className="font-bold text-slate-400">[{prefix}]</span>
      {valor}
    </span>
  );
}
