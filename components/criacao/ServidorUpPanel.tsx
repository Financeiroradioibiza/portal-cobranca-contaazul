"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  CriativoTagSelect,
  formatTagChipPreview,
} from "@/components/criacao/CriativoTagSelect";
import { ServidorUpTrackCompareInline } from "@/components/criacao/ServidorUpTrackCompareInline";
import { listMp3PathsFromFileList } from "@/lib/criacao/atlCricaZipClient";
import {
  getLocalServidorUpConfig,
  LOCAL_SERVIDOR_UP_BASE,
  pingLocalServidorUp,
  scanLocalServidorUpInventory,
  scanLocalServidorUpFingerprints,
  scanLocalServidorUpPaths,
  setLocalServidorUpConfig,
  type LocalServidorUpTrack,
} from "@/lib/criacao/localServidorUpClient";
import {
  aggregateServidorUpFolders,
  type ServidorUpHierarchyPreview,
  type ServidorUpHierarchyRow,
  type ServidorUpHierarchyStatus,
} from "@/lib/criacao/servidorUpHierarchyService";
import type {
  ServidorUpDedupeRow,
  ServidorUpDedupeStatus,
} from "@/lib/criacao/servidorUpDedupeService";
import type {
  ServidorUpMatchBatchResult,
  ServidorUpMatchCandidate,
  ServidorUpMatchRow,
  ServidorUpMatchVerdict,
} from "@/lib/criacao/servidorUpMatchService";
import {
  persistServidorUpUploadSession,
  readServidorUpUploadSession,
  setActiveDeemixJobId,
  writeServidorUpUploadSession,
  writeServidorUpWorkflowDraft,
  type ServidorUpUploadTrack,
} from "@/lib/criacao/servidorUpUploadSession";
import { canonicalDeemixTrackUrl } from "@/lib/criacao/deezerCanonical";
import { pathSegmentLooseKey } from "@/lib/criacao/pathSanitize";

type DeemixJobSnapshot = {
  totalItens: number;
  itensFeitos: number;
  ok: number;
  err: number;
  pending: number;
  processing: number;
};

async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ?
        "Resposta inválida do portal (HTML em vez de JSON). Recarregue a página."
      : `Portal HTTP ${res.status} — recarregue a página e aguarde.`,
    );
  }
}

async function fetchDeemixJobSnapshot(jobId: string): Promise<DeemixJobSnapshot | null> {
  const res = await fetch(`/api/criacao/download/${jobId}`);
  if (!res.ok) return null;
  const detailData = await readApiJson<{
    job?: { totalItens: number; itensFeitos: number; itens: { status: string }[] };
  }>(res);
  const job = detailData.job;
  if (!job) return null;
  return {
    totalItens: job.totalItens,
    itensFeitos: job.itensFeitos,
    ok: job.itens.filter((i) => i.status === "concluido").length,
    err: job.itens.filter((i) => i.status === "erro").length,
    pending: job.itens.filter((i) => i.status === "aguardando").length,
    processing: job.itens.filter((i) => i.status === "processando").length,
  };
}

type RowDraft = {
  uploadTag: string;
  donoUserId: string;
  tagIniciais: string;
  ignored: boolean;
  creating: boolean;
  done: boolean;
  error: string | null;
};

const STATUS_LABEL: Record<ServidorUpHierarchyStatus, string> = {
  ok: "OK",
  missing_pasta: "Pasta ausente",
  missing_programacao: "Programação ausente",
  missing_cliente: "Cliente não encontrado",
};

const STATUS_TONE: Record<ServidorUpHierarchyStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  missing_pasta: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  missing_programacao: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  missing_cliente: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const MATCH_LABEL: Record<ServidorUpMatchVerdict, string> = {
  auto: "Auto OK",
  review: "Revisar",
  pick: "Escolher",
  not_found: "Não achou",
  rejected: "Escolher",
  skipped: "Pulada",
};

const MATCH_TONE: Record<ServidorUpMatchVerdict, string> = {
  auto: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  review: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  pick: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  not_found: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  rejected: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  skipped: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const DEDUPE_LABEL: Record<ServidorUpDedupeStatus, string> = {
  in_biblioteca: "Já na biblioteca",
  suggest_metadata: "Possível duplicata",
  needs_deezer: "Precisa Deezer",
};

const DEDUPE_TONE: Record<ServidorUpDedupeStatus, string> = {
  in_biblioteca: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  suggest_metadata: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  needs_deezer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

/** Só «precisa Deezer» entra no Match/Deemix — deduplicadas ficam fora do download. */
function deemixEligible(status: ServidorUpDedupeStatus | undefined): boolean {
  return !status || status === "needs_deezer";
}

function matchRowExcludedFromReview(
  relativePath: string,
  dedupeMap: Map<string, ServidorUpDedupeRow>,
): boolean {
  return dedupeMap.get(relativePath)?.status === "in_biblioteca";
}

/** Hash/ISRC ou nome parecido — assign direto à pasta no Continuar (sem Deemix). */
function dedupeBibliotecaStatus(status: ServidorUpDedupeStatus | undefined): boolean {
  return status === "in_biblioteca" || status === "suggest_metadata";
}

const ASSIGN_BIBLIOTECA_CHUNK = 40;

type AssignBibliotecaItem = {
  relativePath: string;
  musicaId: string;
  pastaId: string;
  pastaNome: string;
  uploadTagNome: string;
};

type AssignBibliotecaBatchResult = {
  assigned: number;
  skipped: number;
  errors: string[];
};

const STEPS = [
  { n: 0, title: "Hierarquia", desc: "Pastas legado × portal" },
  { n: 1, title: "Inventário", desc: "Scan + dedupe" },
  { n: 2, title: "Match", desc: "Conferir Deezer + revisão" },
  { n: 3, title: "Entrega", desc: "Segundo plano (fecha a aba)" },
] as const;

function rowNeedsAction(row: ServidorUpHierarchyRow, draft: RowDraft | undefined): boolean {
  if (draft?.ignored || draft?.done) return false;
  return row.status !== "ok";
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function matchApproved(
  row: ServidorUpMatchRow,
  picks: Record<string, number>,
  skipped: Set<string>,
): boolean {
  if (skipped.has(row.relativePath)) return false;
  if (row.verdict === "auto" || row.verdict === "review") {
    return Boolean(matchDeezerUrl(row, picks));
  }
  if (row.verdict === "pick" || row.verdict === "rejected") {
    const id = picks[row.relativePath];
    return Boolean(id && row.candidates.some((c) => c.trackId === id));
  }
  return false;
}

function matchPickedCandidate(
  row: ServidorUpMatchRow,
  picks: Record<string, number>,
): ServidorUpMatchCandidate | null {
  const id = picks[row.relativePath];
  if (id) {
    const picked = row.candidates.find((x) => x.trackId === id);
    if (picked) return picked;
  }
  return row.selected;
}

function matchDeezerUrl(row: ServidorUpMatchRow, picks: Record<string, number>): string | null {
  const c = matchPickedCandidate(row, picks);
  const raw = c?.url ?? row.deezerUrl;
  if (!raw) return null;
  return canonicalDeemixTrackUrl(c?.trackId ?? raw) ?? raw;
}

function matchDeemixLabel(row: ServidorUpMatchRow, picks: Record<string, number>): string {
  const c = matchPickedCandidate(row, picks);
  if (c) return `${c.artist} — ${c.title}`;
  return row.searchLine;
}

/** Menor = aparece primeiro na tabela (revisão / escolha antes das auto). */
function matchRowSortPriority(
  verdict: ServidorUpMatchVerdict,
  skipped: boolean,
): number {
  if (skipped) return 90;
  switch (verdict) {
    case "review":
      return 0;
    case "pick":
      return 1;
    case "rejected":
      return 2;
    case "not_found":
      return 3;
    case "auto":
      return 50;
    default:
      return 40;
  }
}

function matchRowNeedsManualAction(
  row: ServidorUpMatchRow,
  skipped: boolean,
): boolean {
  if (skipped) return false;
  return (
    row.verdict === "pick" ||
    row.verdict === "review" ||
    row.verdict === "rejected" ||
    row.verdict === "not_found"
  );
}

export function ServidorUpPanel() {
  const [localHealth, setLocalHealth] = useState<{
    ok: boolean;
    version?: string;
    ffprobe?: boolean;
    fpcalc?: boolean;
  } | null>(null);
  const [rootPath, setRootPath] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<ServidorUpHierarchyPreview | null>(null);
  const [inventory, setInventory] = useState<LocalServidorUpTrack[]>([]);
  const [matchResult, setMatchResult] = useState<ServidorUpMatchBatchResult | null>(null);
  const [matchPicks, setMatchPicks] = useState<Record<string, number>>({});
  const [skippedTracks, setSkippedTracks] = useState<Set<string>>(() => new Set());
  const [dedupeMap, setDedupeMap] = useState<Map<string, ServidorUpDedupeRow>>(() => new Map());
  const [dedupeStats, setDedupeStats] = useState<{
    inBiblioteca: number;
    suggestMetadata: number;
    needsDeezer: number;
  } | null>(null);
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null);
  const [deemixJobSnapshot, setDeemixJobSnapshot] = useState<DeemixJobSnapshot | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [showSetup, setShowSetup] = useState(false);
  const [busy, setBusy] = useState("");
  const [comparePath, setComparePath] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  /** Passo 2: mostrar só faixas que pedem escolha / check / pular. */
  const [matchOnlyManual, setMatchOnlyManual] = useState(true);
  const folderRef = useRef<HTMLInputElement>(null);

  const checkLocal = useCallback(async () => {
    const h = await pingLocalServidorUp();
    setLocalHealth(h ? { ok: true, version: h.version, ffprobe: h.ffprobe, fpcalc: h.fpcalc } : { ok: false });
    if (h?.rootPath) setRootPath((prev) => prev || h.rootPath || "");
  }, []);

  useEffect(() => {
    void checkLocal();
    void getLocalServidorUpConfig().then((p) => {
      if (p) setRootPath(p);
    });
    const saved = readServidorUpUploadSession();
    if (saved?.downloadJobId) setDownloadJobId(saved.downloadJobId);
    const t = setInterval(() => void checkLocal(), 10_000);
    return () => clearInterval(t);
  }, [checkLocal]);

  const refreshDeemixJobSnapshot = useCallback(async (jobId: string) => {
    const snap = await fetchDeemixJobSnapshot(jobId);
    setDeemixJobSnapshot(snap);
    return snap;
  }, []);

  useEffect(() => {
    if (!downloadJobId) {
      setDeemixJobSnapshot(null);
      return;
    }
    void refreshDeemixJobSnapshot(downloadJobId);
  }, [downloadJobId, refreshDeemixJobSnapshot]);

  async function applyHierarchyPreview(paths: Array<{ path: string }>) {
    const { folders, ignoredPaths, warnings } = aggregateServidorUpFolders(paths);
    if (folders.length === 0) {
      throw new Error(
        "Nenhuma pasta válida (Cliente/Programação/Pasta). Confira a estrutura no HD." +
          (warnings[0] ? ` Ex.: ${warnings[0]}` : ""),
      );
    }

    const res = await fetch("/api/criacao/servidor-up/hierarchy-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folders }),
    });

    const raw = await res.text();
    let data: ServidorUpHierarchyPreview & { error?: string };
    try {
      data = JSON.parse(raw) as ServidorUpHierarchyPreview & { error?: string };
    } catch {
      if (res.status === 504) {
        throw new Error(
          "Portal demorou demais (504). Aguarde 1–2 min e tente de novo — o deploy com correção pode ainda estar publicando.",
        );
      }
      throw new Error(`Resposta inválida do portal (${res.status}). Tente recarregar a página.`);
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? `Falha ao analisar hierarquia (${res.status}).`);
    }

    if (ignoredPaths > 0 && data.warnings.length === 0) {
      data.warnings.push(`${ignoredPaths} arquivo(s) ignorado(s) — caminho fora do padrão.`);
    }

    setPreview(data);
    const next: Record<string, RowDraft> = {};
    for (const row of data.rows) {
      next[row.key] = {
        uploadTag: row.suggestedUploadTag,
        donoUserId: row.criativoUserId ?? "",
        tagIniciais: "",
        ignored: false,
        creating: false,
        done: row.status === "ok",
        error: null,
      };
    }
    setDrafts(next);
    setMsg(
      `${data.stats.totalPastas} pasta(s) · ${data.stats.totalMp3} MP3 · ${data.stats.okPastas} OK · ` +
        `${data.stats.missingPastas + data.stats.missingProgramacoes + data.stats.missingClientes} pendência(s).`,
    );
    setActiveStep(0);
  }

  async function salvarRootPath() {
    setErr("");
    if (!rootPath.trim()) {
      setErr("Informe o caminho da pasta raiz no PC.");
      return;
    }
    if (!localHealth?.ok) {
      setErr("Inicie o Servidor UP no PC antes de configurar a pasta.");
      setShowSetup(true);
      return;
    }
    setBusy("Salvando pasta…");
    try {
      const saved = await setLocalServidorUpConfig(rootPath.trim());
      setRootPath(saved);
      setMsg(`Pasta raiz configurada: ${saved}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar pasta.");
    } finally {
      setBusy("");
    }
  }

  async function escanearHierarquiaLocal() {
    setErr("");
    setMsg("");
    setPreview(null);
    setDrafts({});
    if (!localHealth?.ok) {
      setShowSetup(true);
      setErr("Servidor UP offline — inicie Iniciar-ServidorUP no PC.");
      return;
    }
    if (!rootPath.trim()) {
      setErr("Configure a pasta raiz antes de escanear.");
      return;
    }
    setScanning(true);
    try {
      await setLocalServidorUpConfig(rootPath.trim());
      const paths = await scanLocalServidorUpPaths(rootPath.trim());
      if (paths.length === 0) throw new Error("Nenhum MP3 encontrado nessa pasta.");
      await applyHierarchyPreview(paths);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao escanear.");
    } finally {
      setScanning(false);
    }
  }

  async function analisarPastaBrowser(fileList: FileList) {
    setErr("");
    setMsg("");
    setPreview(null);
    setDrafts({});
    setScanning(true);
    try {
      const paths = listMp3PathsFromFileList(fileList);
      if (paths.length === 0) {
        throw new Error("Nenhum MP3 encontrado. Selecione a pasta raiz do legado.");
      }
      await applyHierarchyPreview(paths);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao analisar.");
    } finally {
      setScanning(false);
    }
  }

  function updateDraft(key: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  async function criarEstrutura(row: ServidorUpHierarchyRow) {
    const draft = drafts[row.key];
    if (!draft || draft.creating || draft.done) return;
    if (row.status === "missing_cliente") {
      setErr(`Cliente «${row.clienteNome}» não existe no portal.`);
      return;
    }
    if (!draft.donoUserId.trim() && row.status === "missing_programacao") {
      setErr("Defina o dono da programação antes de criar.");
      return;
    }
    if (!draft.uploadTag.trim()) {
      setErr("Defina a tag criativa antes de criar.");
      return;
    }
    updateDraft(row.key, { creating: true, error: null });
    try {
      let programacaoId = row.programacaoId;
      if (row.status === "missing_programacao") {
        const res = await fetch("/api/criacao/programacoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteRef: row.clienteRef,
            clienteNome: row.clienteNome,
            nome: row.programacaoNome,
            donoUserId: draft.donoUserId,
          }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? "Falha ao criar programação.");
        programacaoId = data.id;
      }
      if (row.status === "missing_pasta" || row.status === "missing_programacao") {
        if (!programacaoId) throw new Error("programacao_ausente");
        const res = await fetch(`/api/criacao/programacoes/${encodeURIComponent(programacaoId)}/pastas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: row.pastaNome }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? "Falha ao criar pasta.");
      }
      updateDraft(row.key, { creating: false, done: true, error: null });
      setPreview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            r.key === row.key ? { ...r, status: "ok" as const, programacaoId: programacaoId ?? r.programacaoId } : r,
          ),
          stats: {
            ...prev.stats,
            okPastas: prev.stats.okPastas + 1,
            missingPastas: row.status === "missing_pasta" ? prev.stats.missingPastas - 1 : prev.stats.missingPastas,
            missingProgramacoes:
              row.status === "missing_programacao" ?
                prev.stats.missingProgramacoes - 1
              : prev.stats.missingProgramacoes,
          },
        };
      });
    } catch (e) {
      updateDraft(row.key, { creating: false, error: e instanceof Error ? e.message : "Erro ao criar." });
    }
  }

  async function runDedupeCheck(tracks: LocalServidorUpTrack[]) {
    if (tracks.length === 0) {
      setDedupeMap(new Map());
      setDedupeStats(null);
      return null;
    }
    const CHUNK = 120;
    const merged = new Map<string, ServidorUpDedupeRow>();
    const stats = { inBiblioteca: 0, suggestMetadata: 0, needsDeezer: 0 };
    for (let i = 0; i < tracks.length; i += CHUNK) {
      const chunk = tracks.slice(i, i + CHUNK);
      const res = await fetch("/api/criacao/servidor-up/dedupe-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: chunk.map((t) => ({
            relativePath: t.relativePath,
            artista: t.artista,
            titulo: t.titulo,
            durationSec: t.durationSec,
            contentHash: t.contentHash ?? null,
            chromaprint: t.chromaprint ?? null,
          })),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: ServidorUpDedupeRow[];
        stats?: typeof stats;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.rows) {
        throw new Error(data.error ?? "Falha no dedupe-check.");
      }
      for (const row of data.rows) merged.set(row.relativePath, row);
      if (data.stats) {
        stats.inBiblioteca += data.stats.inBiblioteca;
        stats.suggestMetadata += data.stats.suggestMetadata;
        stats.needsDeezer += data.stats.needsDeezer;
      }
    }
    setDedupeMap(merged);
    setDedupeStats(stats);
    return stats;
  }

  function dedupeCountsFromMap(map: Map<string, ServidorUpDedupeRow>) {
    let inBiblioteca = 0;
    let suggestMetadata = 0;
    let needsDeezer = 0;
    for (const row of map.values()) {
      if (row.status === "in_biblioteca") inBiblioteca += 1;
      else if (row.status === "suggest_metadata") suggestMetadata += 1;
      else needsDeezer += 1;
    }
    return { inBiblioteca, suggestMetadata, needsDeezer };
  }

  function hierarchyForTrack(track: LocalServidorUpTrack): ServidorUpHierarchyRow | undefined {
    if (!preview) return undefined;
    /** Mesma chave do plano de upload — evita órfãos quando disco é «BOTECO PRINCESA» e portal «Boteco Princesa». */
    const looseCliente = pathSegmentLooseKey(track.clienteNome);
    const looseProg = pathSegmentLooseKey(track.programacaoNome);
    const loosePasta = pathSegmentLooseKey(track.pastaNome);
    return preview.rows.find(
      (r) =>
        pathSegmentLooseKey(r.clienteNome) === looseCliente &&
        pathSegmentLooseKey(r.programacaoNome) === looseProg &&
        pathSegmentLooseKey(r.pastaNome) === loosePasta,
    );
  }

  function uploadTagForTrack(track: LocalServidorUpTrack): string {
    const row = hierarchyForTrack(track);
    if (!row) return track.pastaNome;
    const draft = drafts[row.key];
    return (draft?.uploadTag ?? "").trim() || row.suggestedUploadTag || track.pastaNome;
  }

  async function rodarFingerprints() {
    setErr("");
    if (inventory.length === 0) return;
    try {
      const CHUNK = 40;
      const next = [...inventory];
      for (let i = 0; i < next.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, next.length);
        setBusy(`Fingerprints… ${end}/${next.length}`);
        const paths = next.slice(i, end).map((t) => t.relativePath);
        const fp = await scanLocalServidorUpFingerprints(paths, rootPath.trim() || undefined);
        for (const row of fp.rows) {
          const idx = next.findIndex((t) => t.relativePath === row.relativePath);
          if (idx < 0) continue;
          next[idx] = {
            ...next[idx]!,
            contentHash: row.contentHash ?? next[idx]!.contentHash,
            chromaprint: row.chromaprint ?? next[idx]!.chromaprint,
          };
        }
      }
      setInventory(next);
      await runDedupeCheck(next);
      setMsg(
        `Fingerprints: ${next.filter((t) => t.contentHash).length} hash · ` +
          `${next.filter((t) => t.chromaprint).length} chromaprint.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha nos fingerprints.");
    } finally {
      setBusy("");
    }
  }

  function buildAssignBibliotecaItems(paths: string[]): AssignBibliotecaItem[] {
    return paths
      .map((relativePath) => {
        const dedupe = dedupeMap.get(relativePath);
        const track = inventory.find((t) => t.relativePath === relativePath);
        const hier = track ? hierarchyForTrack(track) : undefined;
        if (!dedupe?.musicaId || !hier?.pastaId || !track) return null;
        return {
          relativePath,
          musicaId: dedupe.musicaId,
          pastaId: hier.pastaId,
          pastaNome: track.pastaNome,
          uploadTagNome: uploadTagForTrack(track),
        };
      })
      .filter((x): x is AssignBibliotecaItem => x !== null);
  }

  function buildAssignBibliotecaItemsWithMusicaIds(
    rows: Array<{ relativePath: string; musicaId: string }>,
  ): AssignBibliotecaItem[] {
    return rows
      .map(({ relativePath, musicaId }) => {
        const track = inventory.find((t) => t.relativePath === relativePath);
        const hier = track ? hierarchyForTrack(track) : undefined;
        if (!hier?.pastaId || !track) return null;
        return {
          relativePath,
          musicaId,
          pastaId: hier.pastaId,
          pastaNome: track.pastaNome,
          uploadTagNome: uploadTagForTrack(track),
        };
      })
      .filter((x): x is AssignBibliotecaItem => x !== null);
  }

  async function assignBibliotecaItemsDirect(
    items: AssignBibliotecaItem[],
    opts?: { keepBusy?: boolean },
  ): Promise<AssignBibliotecaBatchResult> {
    if (items.length === 0) return { assigned: 0, skipped: 0, errors: [] };
    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (let i = 0; i < items.length; i += ASSIGN_BIBLIOTECA_CHUNK) {
      const end = Math.min(i + ASSIGN_BIBLIOTECA_CHUNK, items.length);
      setBusy(`Biblioteca → pasta… ${end}/${items.length}`);
      const batch = await postAssignBibliotecaBatch(items.slice(i, end));
      assigned += batch.assigned;
      skipped += batch.skipped;
      errors.push(...batch.errors);
      if (end < items.length) await new Promise((r) => setTimeout(r, 400));
    }
    return { assigned, skipped, errors };
  }

  async function postAssignBibliotecaBatch(items: AssignBibliotecaItem[]): Promise<AssignBibliotecaBatchResult> {
    const res = await fetch("/api/criacao/servidor-up/assign-biblioteca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await readApiJson<{
      ok?: boolean;
      assigned?: number;
      skipped?: number;
      errors?: string[];
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(data.error ?? "Falha ao atribuir.");
    const assigned = data.assigned ?? 0;
    const skipped = data.skipped ?? 0;
    if (!data.ok && assigned === 0) {
      throw new Error(data.errors?.[0] ?? data.error ?? "Falha ao atribuir.");
    }
    return { assigned, skipped, errors: data.errors ?? [] };
  }

  function diagnoseAssignSkip(paths: string[]): string {
    let semDedupe = 0;
    let semMusicaId = 0;
    let semHierarquia = 0;
    let semPastaId = 0;
    for (const relativePath of paths) {
      const track = inventory.find((t) => t.relativePath === relativePath);
      const dedupe = dedupeMap.get(relativePath);
      if (!track) {
        semDedupe += 1;
        continue;
      }
      if (!dedupe?.musicaId) {
        semMusicaId += 1;
        continue;
      }
      const hier = hierarchyForTrack(track);
      if (!hier) {
        semHierarquia += 1;
        continue;
      }
      if (!hier.pastaId) semPastaId += 1;
    }
    const parts: string[] = [];
    if (semHierarquia) parts.push(`${semHierarquia} sem pasta no passo 0`);
    if (semPastaId) parts.push(`${semPastaId} pasta ainda não criada no portal`);
    if (semMusicaId) parts.push(`${semMusicaId} sem id na biblioteca`);
    return parts.length > 0 ? parts.join(" · ") : "hierarquia/dedupe incompletos";
  }

  async function assignInBibliotecaTracks(
    paths: string[],
    opts?: { keepBusy?: boolean; allowEmpty?: boolean },
  ): Promise<AssignBibliotecaBatchResult> {
    if (paths.length === 0) return { assigned: 0, skipped: 0, errors: [] };
    const items = buildAssignBibliotecaItems(paths);
    if (items.length === 0) {
      const why = diagnoseAssignSkip(paths);
      if (opts?.allowEmpty) {
        return {
          assigned: 0,
          skipped: 0,
          errors: [
            `${paths.length} dedup não entraram na pasta (${why}). Match Deezer segue com as demais.`,
          ],
        };
      }
      throw new Error(
        `Nenhuma faixa válida para atribuir (${why}). Volte ao passo 0 e confirme hierarquia/pastas.`,
      );
    }

    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i += ASSIGN_BIBLIOTECA_CHUNK) {
      const end = Math.min(i + ASSIGN_BIBLIOTECA_CHUNK, items.length);
      setBusy(`Biblioteca → pasta… ${end}/${items.length}`);
      const batch = await postAssignBibliotecaBatch(items.slice(i, end));
      assigned += batch.assigned;
      skipped += batch.skipped;
      errors.push(...batch.errors);
      if (end < items.length) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (errors.length > 0 && assigned === 0) {
      throw new Error(errors[0] ?? "Falha ao atribuir.");
    }

    if (!opts?.keepBusy) {
      const skipHint = skipped > 0 ? ` · ${skipped} já na programação` : "";
      const errHint = errors.length > 0 ? ` · ${errors.length} aviso(s)` : "";
      setMsg(`Atribuídas à pasta: ${assigned} faixa(s) (sem download)${skipHint}${errHint}.`);
    }

    return { assigned, skipped, errors };
  }

  async function rodarInventario() {
    setErr("");
    setBusy("Inventário…");
    try {
      if (!localHealth?.ok) throw new Error("Servidor UP offline.");
      const inv = await scanLocalServidorUpInventory(rootPath.trim() || undefined);
      setInventory(inv.tracks);
      setBusy("Dedupe biblioteca…");
      const ds = await runDedupeCheck(inv.tracks);
      setMsg(
        `Inventário: ${inv.tracks.length} faixa(s) · ffprobe ${inv.stats.ffprobe ? "OK" : "indisponível"}` +
          (ds ?
            ` · ${ds.inBiblioteca} já na biblioteca · ${ds.suggestMetadata} possível duplicata`
          : ""),
      );
      setActiveStep(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no inventário.");
    } finally {
      setBusy("");
    }
  }

  async function rodarMatch() {
    setErr("");
    setMatchResult(null);
    setMatchPicks({});
    setSkippedTracks(new Set());
    try {
      if (inventory.length === 0) throw new Error("Rode o inventário primeiro.");

      const bibliotecaPaths = inventory
        .filter((t) => dedupeBibliotecaStatus(dedupeMap.get(t.relativePath)?.status))
        .map((t) => t.relativePath);

      let assignSummary: AssignBibliotecaBatchResult = { assigned: 0, skipped: 0, errors: [] };
      /** Dedups que não deram para atribuir → entram no Deemix (nunca órfãs). */
      const orphanDedupPaths = new Set<string>();
      if (bibliotecaPaths.length > 0) {
        const assignableBefore = new Set(
          buildAssignBibliotecaItems(bibliotecaPaths).map((i) => i.relativePath),
        );
        for (const p of bibliotecaPaths) {
          if (!assignableBefore.has(p)) orphanDedupPaths.add(p);
        }

        // allowEmpty: não bloqueia Match se hierarquia do passo 0 não casar com as dedup
        assignSummary = await assignInBibliotecaTracks(bibliotecaPaths, {
          keepBusy: true,
          allowEmpty: true,
        });

        if (orphanDedupPaths.size > 0) {
          setDedupeMap((prev) => {
            const next = new Map(prev);
            for (const p of orphanDedupPaths) {
              const row = next.get(p);
              if (!row) continue;
              next.set(p, { ...row, status: "needs_deezer", via: undefined });
            }
            return next;
          });
          assignSummary = {
            ...assignSummary,
            errors: [
              ...assignSummary.errors,
              `${orphanDedupPaths.size} dedup sem pasta no passo 0 → voltam ao Match/Deemix (não ficam órfãs).`,
            ],
          };
        }
      }

      const toMatch = inventory.filter((t) => {
        if (orphanDedupPaths.has(t.relativePath)) return true;
        return deemixEligible(dedupeMap.get(t.relativePath)?.status);
      });

      if (toMatch.length === 0) {
        if (assignSummary.assigned === 0 && assignSummary.errors.length > 0) {
          throw new Error(assignSummary.errors[0]);
        }
        const skipHint =
          assignSummary.skipped > 0 ? ` · ${assignSummary.skipped} já estavam na programação` : "";
        setMsg(
          `${assignSummary.assigned} faixa(s) da biblioteca → pasta${skipHint} · nenhuma precisa Deemix.`,
        );
        setActiveStep(1);
        return;
      }

      const assignWarn =
        assignSummary.errors.length > 0 && assignSummary.assigned === 0 ?
          `⚠ ${assignSummary.errors[0]} · `
        : "";
      const assignPrefix =
        assignSummary.assigned > 0 ?
          `${assignSummary.assigned} biblioteca → pasta · `
        : assignWarn;

      const CHUNK = 5;
      const mergedRows: ServidorUpMatchRow[] = [];
      const mergedStats = {
        total: 0,
        auto: 0,
        review: 0,
        pick: 0,
        notFound: 0,
        rejected: 0,
        apiErrors: 0,
      };

      for (let i = 0; i < toMatch.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, toMatch.length);
        setBusy(`Match Deezer… ${end}/${toMatch.length}`);
        const chunk = toMatch.slice(i, end);
        const res = await fetch("/api/criacao/servidor-up/match-inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracks: chunk }),
        });
        const data = (await res.json()) as ServidorUpMatchBatchResult & { error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? `Falha no match (faixas ${i + 1}–${end}).`);
        mergedRows.push(...data.rows);
        mergedStats.total += data.stats.total;
        mergedStats.auto += data.stats.auto;
        mergedStats.review += data.stats.review;
        mergedStats.pick += data.stats.pick;
        mergedStats.notFound += data.stats.notFound;
        mergedStats.rejected += data.stats.rejected;
        mergedStats.apiErrors += data.stats.apiErrors ?? 0;
        if (end < toMatch.length) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      const picks: Record<string, number> = {};
      for (const row of mergedRows) {
        if (row.selected) picks[row.relativePath] = row.selected.trackId;
      }

      const postMatchInputs = mergedRows
        .filter((row) => row.verdict !== "not_found")
        .map((row) => {
          const id = picks[row.relativePath] ?? row.selected?.trackId;
          const c = id ? row.candidates.find((x) => x.trackId === id) ?? row.selected : row.selected;
          if (!c?.artist?.trim() || !c?.title?.trim()) return null;
          return {
            relativePath: row.relativePath,
            deezerArtista: c.artist.trim(),
            deezerTitulo: c.title.trim(),
            durationSec: c.durationSec ?? row.legacyDurationSec,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      let postMatchSummary: AssignBibliotecaBatchResult = { assigned: 0, skipped: 0, errors: [] };
      const postMatchBibliotecaPaths = new Set<string>();
      if (postMatchInputs.length > 0) {
        setBusy(`Match → biblioteca… 0/${postMatchInputs.length}`);
        const pmRes = await fetch("/api/criacao/servidor-up/post-match-dedupe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracks: postMatchInputs }),
        });
        const pmData = await readApiJson<{
          ok?: boolean;
          hits?: Array<{
            relativePath: string;
            musicaId: string;
            musicaArtista: string;
            musicaTitulo: string;
          }>;
        }>(pmRes);
        if (pmRes.ok && pmData.hits?.length) {
          for (const h of pmData.hits) postMatchBibliotecaPaths.add(h.relativePath);
          setDedupeMap((prev) => {
            const next = new Map(prev);
            for (const h of pmData.hits!) {
              next.set(h.relativePath, {
                relativePath: h.relativePath,
                status: "in_biblioteca",
                via: "metadata",
                musicaId: h.musicaId,
                musicaArtista: h.musicaArtista,
                musicaTitulo: h.musicaTitulo,
              });
            }
            return next;
          });
          const assignItems = buildAssignBibliotecaItemsWithMusicaIds(pmData.hits);
          postMatchSummary = await assignBibliotecaItemsDirect(assignItems, { keepBusy: true });
        }
      }

      const rowsForReview = mergedRows.filter((r) => !postMatchBibliotecaPaths.has(r.relativePath));
      const result: ServidorUpMatchBatchResult = {
        ok: true,
        rows: rowsForReview,
        stats: {
          ...mergedStats,
          total: rowsForReview.length,
        },
      };
      setMatchResult(result);
      setMatchPicks(picks);
      const apiHint =
        mergedStats.apiErrors > 0 ?
          ` · ${mergedStats.apiErrors} falha(s) API Deezer (tente Match de novo)`
        : "";
      const assignSkipHint =
        assignSummary.skipped > 0 ? ` · ${assignSummary.skipped} bib. já na programação` : "";
      const postMatchHint =
        postMatchSummary.assigned > 0 ?
          ` · ${postMatchSummary.assigned} já no acervo (Deezer) → pasta, fora do Deemix`
        : "";
      setMsg(
        `${assignPrefix}Match: ${mergedStats.auto} auto · ${mergedStats.review} revisar · ${mergedStats.pick} escolher · ` +
          `${mergedStats.notFound} não achou · ${mergedStats.rejected} outra versão${postMatchHint}${apiHint}${assignSkipHint}.`,
      );
      setActiveStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no match.");
    } finally {
      setBusy("");
    }
  }

  function buildUploadTracks(): ServidorUpUploadTrack[] {
    if (!matchResult) return [];
    const tracks: ServidorUpUploadTrack[] = [];
    for (const row of matchResult.rows) {
      if (dedupeMap.get(row.relativePath)?.status === "in_biblioteca") continue;
      if (!deemixEligible(dedupeMap.get(row.relativePath)?.status)) continue;
      if (!matchApproved(row, matchPicks, skippedTracks)) continue;
      const url = matchDeezerUrl(row, matchPicks);
      if (!url) continue;
      tracks.push({
        relativePath: row.relativePath,
        clienteNome: row.clienteNome,
        programacaoNome: row.programacaoNome,
        pastaNome: row.pastaNome,
        deezerUrl: url,
      });
    }
    return tracks;
  }

  function persistWorkflowDraft() {
    if (!preview || !matchResult) return;
    writeServidorUpWorkflowDraft({
      rootPath,
      titulo: `Servidor UP · ${rootPath.split("/").pop() || "legado"}`,
      hierarchyRows: preview.rows,
      drafts: Object.fromEntries(
        Object.entries(drafts).map(([key, d]) => [
          key,
          { uploadTag: d.uploadTag, donoUserId: d.donoUserId },
        ]),
      ),
      tracks: buildUploadTracks(),
      matchPicks,
      skippedPaths: [...skippedTracks],
      savedAt: Date.now(),
    });
  }

  function persistUploadSession(jobId: string) {
    if (!preview || !matchResult) return;
    persistWorkflowDraft();
    setActiveDeemixJobId(jobId);
    const payload = {
      downloadJobId: jobId,
      titulo: `Servidor UP · ${rootPath.split("/").pop() || "legado"}`,
      rootPath: rootPath.trim() || undefined,
      hierarchyRows: preview.rows,
      drafts: Object.fromEntries(
        Object.entries(drafts).map(([key, d]) => [
          key,
          { uploadTag: d.uploadTag, donoUserId: d.donoUserId },
        ]),
      ),
      tracks: buildUploadTracks(),
      savedAt: Date.now(),
      autoEnqueueFila: true,
    };
    writeServidorUpUploadSession(payload);
    void persistServidorUpUploadSession(payload);
  }

  /**
   * Após o Match: cria o job Deemix no portal e entrega o resto ao night-worker
   * (Deemix + fila + staging). Não precisa manter a aba aberta.
   */
  async function handOffBackgroundDelivery(
    jobId: string,
    totalItens: number,
    opts?: { quiet?: boolean },
  ) {
    setDownloadJobId(jobId);
    setActiveDeemixJobId(jobId);
    persistUploadSession(jobId);
    setActiveStep(3);

    if (!opts?.quiet) setBusy("Iniciando entrega em segundo plano…");
    try {
      const nw = `/api/criacao/servidor-up/night-worker?downloadLimit=8&downloadJobId=${encodeURIComponent(jobId)}`;
      await fetch(nw, { method: "POST" }).catch(() => null);
      await fetch("/api/criacao/download/sync-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10, timeoutMs: 45_000 }),
      }).catch(() => null);

      const snap = await fetchDeemixJobSnapshot(jobId);
      if (snap) setDeemixJobSnapshot(snap);

      const ok = snap?.ok ?? 0;
      const pending = (snap?.pending ?? 0) + (snap?.processing ?? 0);
      const total = snap?.totalItens ?? totalItens;
      setMsg(
        [
          `Entrega em segundo plano · Job ${jobId.slice(0, 8)}…`,
          `${ok}/${total} baixada(s)`,
          pending > 0 ? `${pending} na fila Deemix` : "Deemix ok — fila/pastas no worker",
          "Pode fechar a aba; o cron night-worker continua.",
        ].join(" · "),
      );
    } finally {
      if (!opts?.quiet) setBusy("");
    }
  }

  async function continuarDownloadDeemix() {
    if (!downloadJobId) return;
    setErr("");
    try {
      const snap = await refreshDeemixJobSnapshot(downloadJobId);
      if (!snap) throw new Error("Job de download não encontrado.");
      await handOffBackgroundDelivery(downloadJobId, snap.totalItens);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao retomar entrega.");
    } finally {
      setBusy("");
    }
  }

  async function criarJobDeemix(forceNew: boolean) {
    setErr("");
    try {
      if (!matchResult) throw new Error("Faça o match antes.");
      if (downloadJobId && !forceNew) {
        const snap = await refreshDeemixJobSnapshot(downloadJobId);
        const pending = (snap?.pending ?? 0) + (snap?.processing ?? 0);
        if (snap && (pending > 0 || snap.ok > 0)) {
          await handOffBackgroundDelivery(downloadJobId, snap.totalItens);
          return;
        }
      }

      const lines: string[] = [];
      for (const row of matchResult.rows) {
        if (dedupeMap.get(row.relativePath)?.status === "in_biblioteca") continue;
        if (!deemixEligible(dedupeMap.get(row.relativePath)?.status)) continue;
        if (!matchApproved(row, matchPicks, skippedTracks)) continue;
        const url = matchDeezerUrl(row, matchPicks);
        if (url) lines.push(url);
      }
      if (lines.length === 0) throw new Error("Nenhuma faixa aprovada para download.");

      const ENQUEUE_CHUNK = 8;
      let jobId: string | undefined = forceNew ? undefined : downloadJobId ?? undefined;
      let totalItens = 0;
      let itensErro = 0;
      let itensPick = 0;
      const titulo = `Servidor UP · ${rootPath.split("/").pop() || "legado"}`;

      for (let i = 0; i < lines.length; i += ENQUEUE_CHUNK) {
        const end = Math.min(i + ENQUEUE_CHUNK, lines.length);
        setBusy(`Enfileirando Deemix… ${end}/${lines.length}`);
        const chunk = lines.slice(i, end);
        const res = await fetch("/api/criacao/servidor-up/enqueue-downloads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo,
            lines: chunk,
            jobId,
            skipProcessing: true,
          }),
        });
        const data = await readApiJson<{
          ok?: boolean;
          jobId?: string;
          totalItens?: number;
          itensErro?: number;
          itensPick?: number;
          error?: string;
        }>(res);
        if (!res.ok || !data.ok || !data.jobId) {
          throw new Error(data.error ?? `Falha ao enfileirar (faixas ${i + 1}–${end}).`);
        }
        jobId = data.jobId;
        totalItens = data.totalItens ?? totalItens;
        itensErro += data.itensErro ?? 0;
        itensPick += data.itensPick ?? 0;
        setDownloadJobId(jobId);
        setActiveDeemixJobId(jobId);
        if (preview && matchResult) persistUploadSession(jobId);
        else persistWorkflowDraft();
        if (end < lines.length) await new Promise((r) => setTimeout(r, 400));
      }

      if (!jobId) throw new Error("Job Deemix não criado.");
      const notes: string[] = [];
      if (itensPick > 0) {
        notes.push(`${itensPick} faixa(s) aguardando escolha manual na fila Deemix`);
      }
      if (itensErro > 0) notes.push(`${itensErro} erro(s) ao enfileirar`);
      if (notes.length) setMsg(notes.join(" · "));

      await handOffBackgroundDelivery(jobId, totalItens);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao enfileirar.");
    } finally {
      setBusy("");
    }
  }

  const pendingCount = preview?.rows.filter((r) => rowNeedsAction(r, drafts[r.key])).length ?? 0;
  const step0Ready = preview !== null && pendingCount === 0;
  const matchRowsForUi =
    matchResult?.rows.filter((r) => !matchRowExcludedFromReview(r.relativePath, dedupeMap)) ?? [];
  const reviewRows =
    matchRowsForUi.filter(
      (r) => !skippedTracks.has(r.relativePath) && (r.verdict === "pick" || r.verdict === "review" || r.verdict === "rejected"),
    );
  const manualActionRows = matchRowsForUi.filter((r) =>
    matchRowNeedsManualAction(r, skippedTracks.has(r.relativePath)),
  );
  const sortedMatchRows = [...matchRowsForUi].sort((a, b) => {
    const pa = matchRowSortPriority(a.verdict, skippedTracks.has(a.relativePath));
    const pb = matchRowSortPriority(b.verdict, skippedTracks.has(b.relativePath));
    if (pa !== pb) return pa - pb;
    return a.searchLine.localeCompare(b.searchLine, "pt-BR");
  });
  const visibleMatchRows = matchOnlyManual ?
      sortedMatchRows.filter((r) =>
        matchRowNeedsManualAction(r, skippedTracks.has(r.relativePath)),
      )
    : sortedMatchRows;
  const approvedCount =
    matchRowsForUi.filter((r) => matchApproved(r, matchPicks, skippedTracks)).length;
  const inBibliotecaTracks = inventory.filter(
    (t) => dedupeMap.get(t.relativePath)?.status === "in_biblioteca",
  );
  const suggestMetadataTracks = inventory.filter(
    (t) => dedupeMap.get(t.relativePath)?.status === "suggest_metadata",
  );
  const bibliotecaAssignTracks = inventory.filter((t) =>
    dedupeBibliotecaStatus(dedupeMap.get(t.relativePath)?.status),
  );
  const needsDeemixTracks = inventory.filter((t) =>
    deemixEligible(dedupeMap.get(t.relativePath)?.status),
  );
  const liveDedupeStats =
    dedupeMap.size > 0 ? dedupeCountsFromMap(dedupeMap) : dedupeStats;

  const deemixPending =
    deemixJobSnapshot != null ?
      deemixJobSnapshot.pending + deemixJobSnapshot.processing
    : null;
  const hasDeemixJob = Boolean(downloadJobId && deemixJobSnapshot && deemixJobSnapshot.totalItens > 0);
  const deemixInProgress = hasDeemixJob && (deemixPending ?? 0) > 0;
  const canStartFreshDeemix = !deemixInProgress && !busy;
  const entregaHandoffRef = useRef<string | null>(null);

  /** Ao reabrir com job pendente: um kick no worker (não fica polling horas na aba). */
  useEffect(() => {
    if (!downloadJobId || !matchResult || busy) return;
    const pending = (deemixJobSnapshot?.pending ?? 0) + (deemixJobSnapshot?.processing ?? 0);
    const hasProgress = (deemixJobSnapshot?.ok ?? 0) > 0 || pending > 0;
    if (!hasProgress) return;
    const key = `bg:${downloadJobId}`;
    if (entregaHandoffRef.current === key) return;
    entregaHandoffRef.current = key;
    void handOffBackgroundDelivery(downloadJobId, deemixJobSnapshot?.totalItens ?? 0, {
      quiet: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handoff único ao restaurar sessão
  }, [downloadJobId, matchResult, deemixJobSnapshot?.pending, deemixJobSnapshot?.processing, busy]);

  /** Contadores na UI + kick leve; o cron cobrir se a aba fechar / sessão expirar. */
  useEffect(() => {
    if (!downloadJobId || !hasDeemixJob) return;
    const pending = (deemixJobSnapshot?.pending ?? 0) + (deemixJobSnapshot?.processing ?? 0);
    if (pending <= 0 && (deemixJobSnapshot?.ok ?? 0) <= 0) return;
    const t = setInterval(() => {
      void refreshDeemixJobSnapshot(downloadJobId);
      void fetch(
        `/api/criacao/servidor-up/night-worker?downloadLimit=8&downloadJobId=${encodeURIComponent(downloadJobId)}`,
        { method: "POST" },
      ).catch(() => null);
    }, 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll leve enquanto a aba estiver aberta
  }, [downloadJobId, hasDeemixJob, deemixJobSnapshot?.pending, deemixJobSnapshot?.processing]);

  useEffect(() => {
    if (downloadJobId && preview && matchResult) {
      persistUploadSession(downloadJobId);
    }
    if (preview && matchResult) {
      persistWorkflowDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persiste sessão quando dados mudam
  }, [downloadJobId, preview, matchResult, drafts, matchPicks, skippedTracks, rootPath]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Servidor UP</div>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Suba o legado: hierarquia → inventário → Match Deezer (sua revisão) → entrega em segundo plano
          (Deemix + fila + pasta). Depois do Entregar pode fechar a aba.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setActiveStep(s.n)}
            className={
              "rounded-xl border px-3 py-2.5 text-left transition " +
              (activeStep === s.n ?
                "border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40"
              : "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40")
            }
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Passo {s.n}</div>
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="text-[11px] text-slate-500">{s.desc}</div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-semibold">Agente local</p>
            <p className="text-xs text-slate-500">
              <code className="text-[10px]">{LOCAL_SERVIDOR_UP_BASE}</code>
              {localHealth?.ffprobe === false ?
                " · ffprobe ausente (brew install ffmpeg)"
              : null}
            </p>
          </div>
          <span
            className={
              "ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold " +
              (localHealth?.ok ?
                "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-900")
            }
          >
            {localHealth === null ?
              "Verificando…"
            : localHealth.ok ?
              `Conectado${localHealth.version ? ` · v${localHealth.version}` : ""}`
            : "Offline"}
          </span>
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
          >
            {showSetup ? "Ocultar setup" : "Como instalar"}
          </button>
        </div>

        {showSetup ?
          <div className="mt-4 space-y-2 rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-700">
            <p>
              <strong>1.</strong> No repositório, abra{" "}
              <code>tools/servidor-up/Iniciar-ServidorUP.command</code> (Mac) ou{" "}
              <code>Iniciar-ServidorUP.bat</code> (Windows).
            </p>
            <p>
              <strong>2.</strong> Aceite o certificado em{" "}
              <a href={`${LOCAL_SERVIDOR_UP_BASE}/health`} target="_blank" rel="noreferrer" className="text-violet-600 underline">
                {LOCAL_SERVIDOR_UP_BASE}/health
              </a>
            </p>
            <p>
              <strong>3.</strong> Informe abaixo o caminho da pasta raiz (ex.{" "}
              <code>/Users/voce/LegadoTeste</code>) e clique <strong>Salvar pasta</strong>.
            </p>
            <p>
              <strong>4.</strong> Deixe a janela do agente aberta durante toda a migração.
            </p>
          </div>
        : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Pasta raiz no PC</span>
            <input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="/Users/voce/LegadoTeste"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void salvarRootPath()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700"
          >
            Salvar pasta
          </button>
        </div>
      </div>

      {(msg || err || busy) ?
        <div className="space-y-2 text-sm">
          {busy ?
            <p className="text-violet-700">{busy}</p>
          : null}
          {msg ?
            <p className="text-emerald-800 dark:text-emerald-200">{msg}</p>
          : null}
          {err ?
            <p className="text-red-700 dark:text-red-300">{err}</p>
          : null}
        </div>
      : null}

      {activeStep === 0 ?
        <>
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Passo 0 — Hierarquia</p>
                <p className="mt-1 text-xs text-violet-800/90">
                  Escaneie pelo agente local (recomendado) ou selecione a pasta no navegador.
                </p>
              </div>
              <button
                type="button"
                disabled={scanning || !!busy}
                onClick={() => void escanearHierarquiaLocal()}
                className="rounded-lg bg-violet-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {scanning ? "Escaneando…" : "Escanear no PC"}
              </button>
              <input
                ref={folderRef}
                type="file"
                className="hidden"
                // @ts-expect-error webkitdirectory
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => {
                  const fl = e.target.files;
                  if (fl?.length) void analisarPastaBrowser(fl);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={scanning}
                onClick={() => folderRef.current?.click()}
                className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-900 dark:border-violet-700"
              >
                Pasta no navegador
              </button>
            </div>
            {preview?.warnings.length ?
              <ul className="mt-3 list-inside list-disc text-xs text-amber-800">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            : null}
          </div>

          {preview ?
            <HierarchyTable
              preview={preview}
              drafts={drafts}
              updateDraft={updateDraft}
              criarEstrutura={criarEstrutura}
            />
          : null}

          {step0Ready ?
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!!busy || !localHealth?.ok}
                onClick={() => void rodarInventario()}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Continuar → Inventário (passo 1)
              </button>
            </div>
          : preview && pendingCount > 0 ?
            <p className="text-sm text-amber-800">Resolva ou ignore {pendingCount} pendência(s) antes de continuar.</p>
          : null}
        </>
      : null}

      {activeStep >= 1 ?
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-semibold">Passo 1 — Inventário</p>
          <p className="mt-1 text-xs text-slate-500">
            {inventory.length > 0 ?
              `${inventory.length} faixa(s) lidas do disco.`
            : "Ainda não escaneado."}
            {liveDedupeStats ?
              ` · ${liveDedupeStats.inBiblioteca} já na biblioteca · ${liveDedupeStats.suggestMetadata} possível duplicata · ${liveDedupeStats.needsDeezer} precisa Deezer`
            : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy || !localHealth?.ok}
              onClick={() => void rodarInventario()}
              className="rounded-lg bg-violet-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {inventory.length ? "Re-escanear" : "Escanear MP3 + duração"}
            </button>
            {inventory.length > 0 ?
              <>
                <button
                  type="button"
                  disabled={!!busy || !localHealth?.ok}
                  onClick={() => void rodarFingerprints()}
                  className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-900 disabled:opacity-50 dark:border-teal-600 dark:text-teal-200"
                  title={localHealth?.fpcalc ? "Hash SHA256 + Chromaprint (fpcalc)" : "Instale fpcalc/chromaprint no Mac"}
                >
                  Fingerprints (hash + chromaprint)
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void rodarMatch()}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {bibliotecaAssignTracks.length > 0 && needsDeemixTracks.length > 0 ?
                    `Continuar → ${bibliotecaAssignTracks.length} dedup → pasta + Match (${needsDeemixTracks.length})`
                  : bibliotecaAssignTracks.length > 0 ?
                    `Continuar → ${bibliotecaAssignTracks.length} dedup → pasta`
                  : `Continuar → Match Deezer (${needsDeemixTracks.length})`}
                </button>
                {bibliotecaAssignTracks.length > 0 && needsDeemixTracks.length > 0 ?
                  <p className="w-full text-xs text-slate-500">
                    Ao continuar: {bibliotecaAssignTracks.length} deduplicada(s) vão direto à pasta (biblioteca);
                    só as {needsDeemixTracks.length} restantes passam pelo Match, Deemix e fila.
                  </p>
                : bibliotecaAssignTracks.length > 0 ?
                  <p className="w-full text-xs text-slate-500">
                    Ao continuar: todas as {bibliotecaAssignTracks.length} faixa(s) deduplicadas vão direto à
                    pasta — nenhuma precisa Deemix.
                  </p>
                : null}
              </>
            : null}
          </div>
        </div>
      : null}

      {activeStep >= 2 && matchResult ?
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm font-semibold">Passo 2 — Match e revisão</p>
            <p className="mt-1 text-xs text-slate-500">
              Aprovadas para download: {approvedCount} / {matchRowsForUi.length}
              {skippedTracks.size > 0 ? ` · ${skippedTracks.size} pulada(s)` : ""}
              {inBibliotecaTracks.length > 0 ?
                ` · ${inBibliotecaTracks.length} já na biblioteca (atribuídas à pasta, fora desta lista)`
              : ""}
              {suggestMetadataTracks.length > 0 ?
                ` · ${suggestMetadataTracks.length} possível duplicata → pasta no Continuar`
              : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Na dúvida: use <strong>Check</strong> para comparar legado × Deemix (waveforms) — só quando
              precisar. Ou abra o Deezer, escolha na lista, ou <strong>Pular</strong>.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={matchOnlyManual}
                  onChange={(e) => setMatchOnlyManual(e.target.checked)}
                  className="rounded border-slate-400"
                />
                Só as que precisam revisão ({manualActionRows.length})
              </label>
              <span className="text-[11px] text-slate-400">
                Ordenação: revisão → escolher → rejeitada → não achou → auto
              </span>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Faixa legado</th>
                  <th className="px-3 py-2">Dur.</th>
                  <th className="px-3 py-2">Biblioteca</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Deezer</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleMatchRows.length === 0 ?
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                      {matchOnlyManual ?
                        "Nenhuma faixa pedindo revisão — desmarque o filtro para ver as auto-aprovadas."
                      : "Sem faixas no Match."}
                    </td>
                  </tr>
                : null}
                {visibleMatchRows.map((row) => {
                  const isSkipped = skippedTracks.has(row.relativePath);
                  const showPicker =
                    !isSkipped &&
                    row.candidates.length > 0 &&
                    (row.verdict === "pick" ||
                      row.verdict === "review" ||
                      row.verdict === "rejected" ||
                      row.verdict === "not_found");
                  const deezerUrl = matchDeezerUrl(row, matchPicks) ?? row.selected?.url ?? null;
                  const canCheck = !isSkipped && Boolean(deezerUrl);
                  const isCompareOpen = comparePath === row.relativePath;

                  return (
                  <Fragment key={row.relativePath}>
                  <tr className={isSkipped ? "opacity-50" : undefined}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.searchLine}</div>
                      {row.normalizedSearchLine !== row.searchLine ?
                        <div className="text-[10px] text-violet-600">Busca: {row.normalizedSearchLine}</div>
                      : null}
                      <div className="text-[10px] text-slate-500">{row.relativePath}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDuration(row.legacyDurationSec)}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const dedupe = dedupeMap.get(row.relativePath);
                        if (!dedupe || dedupe.status === "needs_deezer") {
                          return <span className="text-[11px] text-slate-400">Precisa Deezer</span>;
                        }
                        return (
                          <div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DEDUPE_TONE[dedupe.status]}`}
                            >
                              {DEDUPE_LABEL[dedupe.status]}
                            </span>
                            {dedupe.musicaArtista && dedupe.musicaTitulo ?
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                {dedupe.musicaArtista} — {dedupe.musicaTitulo}
                              </div>
                            : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${MATCH_TONE[isSkipped ? "skipped" : row.verdict]}`}
                      >
                        {isSkipped ? "Pulada" : MATCH_LABEL[row.verdict]}
                      </span>
                      {!isSkipped ?
                        <div className="text-[10px] text-slate-500">{row.verdictReason}</div>
                      : null}
                    </td>
                    <td className="px-3 py-2">
                      {showPicker ?
                        <select
                          value={matchPicks[row.relativePath] ?? row.selected?.trackId ?? ""}
                          onChange={(e) =>
                            setMatchPicks((p) => ({
                              ...p,
                              [row.relativePath]: Number(e.target.value),
                            }))
                          }
                          className="w-full max-w-xs rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="">Escolher versão…</option>
                          {row.candidates.map((c) => (
                            <option key={c.trackId} value={c.trackId}>
                              {c.artist} — {c.title} ({formatDuration(c.durationSec)}, score {c.score})
                            </option>
                          ))}
                        </select>
                      : row.selected && !isSkipped ?
                        <div className="text-xs">
                          {row.selected.artist} — {row.selected.title}
                          <div className="text-slate-500">
                            Deezer {formatDuration(row.selected.durationSec)}
                            {row.selected.durationDiffSec != null ?
                              ` · Δ ${row.selected.durationDiffSec.toFixed(0)}s`
                            : null}
                          </div>
                        </div>
                      : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {deezerUrl ?
                          <a
                            href={deezerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border px-2 py-0.5 text-[10px] font-semibold dark:border-slate-700"
                          >
                            Ouvir Deezer
                          </a>
                        : null}
                        {canCheck ?
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              setComparePath((prev) =>
                                prev === row.relativePath ? null : row.relativePath,
                              )
                            }
                            className={`rounded border px-2 py-0.5 text-[10px] font-semibold dark:border-slate-700 ${
                              isCompareOpen ?
                                "border-amber-500 bg-amber-100 text-amber-950 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
                              : ""
                            }`}
                          >
                            {isCompareOpen ? "Fechar check" : "Check"}
                          </button>
                        : null}
                        <button
                          type="button"
                          onClick={() =>
                            setSkippedTracks((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.relativePath)) next.delete(row.relativePath);
                              else next.add(row.relativePath);
                              return next;
                            })
                          }
                          className="rounded border px-2 py-0.5 text-[10px] font-semibold dark:border-slate-700"
                        >
                          {isSkipped ? "Desfazer" : "Pular"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isCompareOpen && deezerUrl ?
                    <tr>
                      <td colSpan={5} className="px-3 py-3">
                        <ServidorUpTrackCompareInline
                          relativePath={row.relativePath}
                          legacyLabel={row.searchLine}
                          deemixLabel={matchDeemixLabel(row, matchPicks)}
                          deezerUrl={deezerUrl}
                          previewJobId={previewJobId}
                          onPreviewJobId={setPreviewJobId}
                          onClose={() => setComparePath(null)}
                        />
                      </td>
                    </tr>
                  : null}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {reviewRows.length > 0 ?
            <p className="text-xs text-amber-800">
              {reviewRows.length} faixa(s) precisam de escolha manual antes de entregar.
            </p>
          : null}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/25">
            <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">Entrega nas pastas</p>
            {deemixInProgress ?
              <p className="mt-2 text-sm text-violet-900 dark:text-violet-100">
                {busy ||
                  `Segundo plano: ${deemixJobSnapshot!.ok}/${deemixJobSnapshot!.totalItens} baixada(s). Pode fechar a aba.`}
              </p>
            : hasDeemixJob && (deemixJobSnapshot!.ok > 0) ?
              <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">
                {busy ||
                  `${deemixJobSnapshot!.ok} faixa(s) baixada(s) — fila e pastas no night-worker (pode fechar a aba).`}
              </p>
            : <>
                <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-200/90">
                  Conferiu o Match? Clique uma vez: enfileira no Deemix e o resto roda em segundo plano
                  (não precisa deixar o PC/aba abertos). Seu papel é só revisar o Match.
                </p>
                <button
                  type="button"
                  disabled={!!busy || approvedCount === 0 || !canStartFreshDeemix}
                  onClick={() => {
                    setActiveStep(3);
                    void criarJobDeemix(false);
                  }}
                  className="mt-3 rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Entregar {approvedCount} faixa(s) nas pastas
                </button>
              </>
            }
          </div>
        </div>
      : null}

      {activeStep >= 3 && matchResult ?
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-semibold">Passo 3 — Entrega (segundo plano)</p>
          <p className="mt-1 text-xs text-slate-500">
            {deemixInProgress ?
              `Deemix ${deemixJobSnapshot?.ok ?? 0}/${deemixJobSnapshot?.totalItens ?? "?"} — worker continua sem a aba.`
            : hasDeemixJob ?
              `${deemixJobSnapshot?.ok ?? 0} baixada(s) — fila/pastas no night-worker até aparecerem na programação.`
            : "Aguardando início da entrega no passo Match."}
          </p>
          {hasDeemixJob ?
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void continuarDownloadDeemix()}
              className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-600"
            >
              Acelerar agora (kick no worker)
            </button>
          : null}
        </div>
      : null}
    </div>
  );
}

function HierarchyTable({
  preview,
  drafts,
  updateDraft,
  criarEstrutura,
}: {
  preview: ServidorUpHierarchyPreview;
  drafts: Record<string, RowDraft>;
  updateDraft: (key: string, patch: Partial<RowDraft>) => void;
  criarEstrutura: (row: ServidorUpHierarchyRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900">
          <tr>
            <th className="px-3 py-2">Caminho</th>
            <th className="px-3 py-2">MP3</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Tag na subida</th>
            <th className="px-3 py-2">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {preview.rows.map((row) => {
            const draft = drafts[row.key];
            const needsAction = rowNeedsAction(row, draft);
            const tagPreview = formatTagChipPreview(draft?.tagIniciais ?? "", draft?.uploadTag ?? row.suggestedUploadTag);

            return (
              <tr key={row.key} className={draft?.done ? "bg-emerald-50/50 dark:bg-emerald-950/10" : undefined}>
                <td className="px-3 py-3">
                  <div className="font-medium">
                    {row.clienteNome} / {row.programacaoNome} / {row.pastaNome}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{row.mp3Count}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[draft?.done ? "ok" : row.status]}`}
                  >
                    {draft?.done ? "OK" : STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {needsAction || row.status === "ok" ?
                    <div className="space-y-2">
                      {(row.status === "missing_programacao" || !row.criativoUserId) && needsAction ?
                        <CriativoTagSelect
                          value={draft?.donoUserId ?? ""}
                          onChange={(v) => updateDraft(row.key, { donoUserId: v })}
                          onSelected={(c) =>
                            updateDraft(row.key, { donoUserId: c?.email ?? "", tagIniciais: c?.tagIniciais ?? "" })
                          }
                          label="Dono / tag"
                          className="max-w-xs"
                        />
                      : null}
                      <label className="block max-w-xs text-xs">
                        <span className="mb-0.5 block font-semibold text-slate-500">Estilo (tag)</span>
                        <input
                          value={draft?.uploadTag ?? row.suggestedUploadTag}
                          onChange={(e) => updateDraft(row.key, { uploadTag: e.target.value })}
                          disabled={!needsAction && row.status === "ok"}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                        <span className="mt-0.5 block text-[10px] text-slate-400">Preview: {tagPreview}</span>
                      </label>
                    </div>
                  : null}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {needsAction && row.status !== "missing_cliente" ?
                      <button
                        type="button"
                        disabled={draft?.creating}
                        onClick={() => void criarEstrutura(row)}
                        className="rounded-lg bg-violet-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {draft?.creating ? "Criando…" : "Criar no portal"}
                      </button>
                    : null}
                    {needsAction ?
                      <button
                        type="button"
                        onClick={() => updateDraft(row.key, { ignored: true })}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      >
                        Ignorar
                      </button>
                    : null}
                    {draft?.error ?
                      <span className="text-xs text-red-600">{draft.error}</span>
                    : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
