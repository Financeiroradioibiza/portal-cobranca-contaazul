"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CriativoTagSelect,
  formatTagChipPreview,
} from "@/components/criacao/CriativoTagSelect";
import { listMp3PathsFromFileList } from "@/lib/criacao/atlCricaZipClient";
import {
  getLocalServidorUpConfig,
  LOCAL_SERVIDOR_UP_BASE,
  pingLocalServidorUp,
  scanLocalServidorUpInventory,
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
  ServidorUpMatchBatchResult,
  ServidorUpMatchRow,
  ServidorUpMatchVerdict,
} from "@/lib/criacao/servidorUpMatchService";
import {
  writeServidorUpUploadSession,
  type ServidorUpUploadTrack,
} from "@/lib/criacao/servidorUpUploadSession";

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

const STEPS = [
  { n: 0, title: "Hierarquia", desc: "Pastas legado × portal" },
  { n: 1, title: "Inventário", desc: "Scan + ffprobe" },
  { n: 2, title: "Match Deezer", desc: "Duração legado × Deezer" },
  { n: 3, title: "Revisão", desc: "Ambíguos" },
  { n: 4, title: "Deemix", desc: "Download 320k" },
  { n: 5, title: "Subida", desc: "Multi-upload pastas" },
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
  if (row.verdict === "auto") return Boolean(row.deezerUrl);
  if (row.verdict === "review") return Boolean(row.deezerUrl);
  if (row.verdict === "pick" || row.verdict === "rejected") {
    const id = picks[row.relativePath];
    return Boolean(id && row.candidates.some((c) => c.trackId === id));
  }
  return false;
}

function matchDeezerUrl(row: ServidorUpMatchRow, picks: Record<string, number>): string | null {
  if (row.verdict === "auto" || row.verdict === "review") return row.deezerUrl;
  const id = picks[row.relativePath];
  const c = row.candidates.find((x) => x.trackId === id);
  return c?.url ?? null;
}

export function ServidorUpPanel() {
  const router = useRouter();
  const [localHealth, setLocalHealth] = useState<{ ok: boolean; version?: string; ffprobe?: boolean } | null>(
    null,
  );
  const [rootPath, setRootPath] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<ServidorUpHierarchyPreview | null>(null);
  const [inventory, setInventory] = useState<LocalServidorUpTrack[]>([]);
  const [matchResult, setMatchResult] = useState<ServidorUpMatchBatchResult | null>(null);
  const [matchPicks, setMatchPicks] = useState<Record<string, number>>({});
  const [skippedTracks, setSkippedTracks] = useState<Set<string>>(() => new Set());
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [showSetup, setShowSetup] = useState(false);
  const [busy, setBusy] = useState("");
  const folderRef = useRef<HTMLInputElement>(null);

  const checkLocal = useCallback(async () => {
    const h = await pingLocalServidorUp();
    setLocalHealth(h ? { ok: true, version: h.version, ffprobe: h.ffprobe } : { ok: false });
    if (h?.rootPath) setRootPath((prev) => prev || h.rootPath || "");
  }, []);

  useEffect(() => {
    void checkLocal();
    void getLocalServidorUpConfig().then((p) => {
      if (p) setRootPath(p);
    });
    const t = setInterval(() => void checkLocal(), 10_000);
    return () => clearInterval(t);
  }, [checkLocal]);

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

  async function rodarInventario() {
    setErr("");
    setBusy("Inventário…");
    try {
      if (!localHealth?.ok) throw new Error("Servidor UP offline.");
      const inv = await scanLocalServidorUpInventory(rootPath.trim() || undefined);
      setInventory(inv.tracks);
      setMsg(`Inventário: ${inv.tracks.length} faixa(s) · ffprobe ${inv.stats.ffprobe ? "OK" : "indisponível"}.`);
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

      for (let i = 0; i < inventory.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, inventory.length);
        setBusy(`Match Deezer… ${end}/${inventory.length}`);
        const chunk = inventory.slice(i, end);
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
        if (end < inventory.length) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      const result: ServidorUpMatchBatchResult = { ok: true, rows: mergedRows, stats: mergedStats };
      setMatchResult(result);
      const picks: Record<string, number> = {};
      for (const row of mergedRows) {
        if (row.selected) picks[row.relativePath] = row.selected.trackId;
      }
      setMatchPicks(picks);
      const apiHint =
        mergedStats.apiErrors > 0 ?
          ` · ${mergedStats.apiErrors} falha(s) API Deezer (tente Match de novo)`
        : "";
      setMsg(
        `Match: ${mergedStats.auto} auto · ${mergedStats.review} revisar · ${mergedStats.pick} escolher · ` +
          `${mergedStats.notFound} não achou · ${mergedStats.rejected} outra versão${apiHint}.`,
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

  function persistUploadSession(jobId: string) {
    if (!preview || !matchResult) return;
    writeServidorUpUploadSession({
      downloadJobId: jobId,
      titulo: `Servidor UP · ${rootPath.split("/").pop() || "legado"}`,
      hierarchyRows: preview.rows,
      drafts: Object.fromEntries(
        Object.entries(drafts).map(([key, d]) => [
          key,
          { uploadTag: d.uploadTag, donoUserId: d.donoUserId },
        ]),
      ),
      tracks: buildUploadTracks(),
      savedAt: Date.now(),
    });
  }

  function irParaMultiUpload() {
    if (!downloadJobId) {
      setErr("Faça o download Deemix (passo 4) antes da subida.");
      return;
    }
    if (!preview || !matchResult) {
      setErr("Dados do Servidor UP incompletos — refaça hierarquia e match.");
      return;
    }
    persistUploadSession(downloadJobId);
    router.push("/criacao/upload?servidorUp=1");
  }

  async function enfileirarDownloads() {
    setErr("");
    try {
      if (!matchResult) throw new Error("Faça o match antes.");
      const lines: string[] = [];
      for (const row of matchResult.rows) {
        if (!matchApproved(row, matchPicks, skippedTracks)) continue;
        const url = matchDeezerUrl(row, matchPicks);
        if (url) lines.push(url);
      }
      if (lines.length === 0) throw new Error("Nenhuma faixa aprovada para download.");

      const ENQUEUE_CHUNK = 8;
      const PROCESS_LIMIT = 5;
      let jobId: string | undefined;
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
        const data = (await res.json()) as {
          ok?: boolean;
          jobId?: string;
          totalItens?: number;
          itensErro?: number;
          itensPick?: number;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.jobId) {
          throw new Error(data.error ?? `Falha ao enfileirar (faixas ${i + 1}–${end}).`);
        }
        jobId = data.jobId;
        totalItens = data.totalItens ?? totalItens;
        itensErro += data.itensErro ?? 0;
        itensPick += data.itensPick ?? 0;
        if (end < lines.length) await new Promise((r) => setTimeout(r, 400));
      }

      if (!jobId) throw new Error("Job Deemix não criado.");

      const maxRounds = Math.ceil(lines.length / PROCESS_LIMIT) * 4 + 4;
      let processErrors = 0;
      for (let round = 0; round < maxRounds; round++) {
        const detailRes = await fetch(`/api/criacao/download/${jobId}`);
        const detailData = (await detailRes.json()) as {
          job?: { totalItens: number; itensFeitos: number; itens: { status: string }[] };
        };
        const job = detailData.job;
        if (!job) break;

        const pending = job.itens.filter(
          (i) => i.status === "aguardando" || i.status === "processando",
        ).length;
        if (pending === 0) break;

        setBusy(`Baixando Deemix… ${job.itensFeitos}/${job.totalItens} (${pending} pendente(s))`);

        const syncRes = await fetch("/api/criacao/download/sync-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: PROCESS_LIMIT, timeoutMs: 45_000 }),
        });
        const syncData = (await syncRes.json()) as {
          triggered?: boolean;
          processed?: number;
          error?: string;
        };
        if (!syncRes.ok || syncData.error) processErrors += 1;
        await new Promise((r) => setTimeout(r, 800));
      }

      const finalRes = await fetch(`/api/criacao/download/${jobId}`);
      const finalData = (await finalRes.json()) as {
        job?: { totalItens: number; itensFeitos: number; itens: { status: string }[] };
      };
      const finalJob = finalData.job;
      const okCount = finalJob?.itens.filter((i) => i.status === "concluido").length ?? 0;
      const errCount = finalJob?.itens.filter((i) => i.status === "erro").length ?? 0;
      const pendingCount =
        finalJob?.itens.filter((i) => i.status === "aguardando" || i.status === "processando")
          .length ?? 0;

      const parts = [
        `Deemix: ${okCount}/${totalItens} baixada(s)`,
        `Job ${jobId.slice(0, 8)}…`,
      ];
      if (itensPick > 0) parts.push(`${itensPick} aguardando escolha`);
      if (errCount > 0) parts.push(`${errCount} erro(s)`);
      if (pendingCount > 0) {
        parts.push(
          `${pendingCount} ainda pendente(s) — abra Download link e aguarde, ou clique Passo 4 de novo`,
        );
      }
      if (processErrors > 0 && pendingCount > 0) {
        parts.push("(alguns lotes deram timeout no worker — o download continua em segundo plano)");
      }
      setMsg(parts.join(" · "));
      setDownloadJobId(jobId);
      persistUploadSession(jobId);
      setActiveStep(5);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao enfileirar.");
    } finally {
      setBusy("");
    }
  }

  const pendingCount = preview?.rows.filter((r) => rowNeedsAction(r, drafts[r.key])).length ?? 0;
  const step0Ready = preview !== null && pendingCount === 0;
  const reviewRows =
    matchResult?.rows.filter(
      (r) => !skippedTracks.has(r.relativePath) && (r.verdict === "pick" || r.verdict === "review" || r.verdict === "rejected"),
    ) ?? [];
  const approvedCount =
    matchResult?.rows.filter((r) => matchApproved(r, matchPicks, skippedTracks)).length ?? 0;

  useEffect(() => {
    if (downloadJobId && preview && matchResult) {
      persistUploadSession(downloadJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persiste sessão quando dados mudam
  }, [downloadJobId, preview, matchResult, drafts, matchPicks, skippedTracks, rootPath]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Servidor UP</div>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Migração legado → qualidade alta: scan no PC, match Deezer por duração, download 320k e fila cloud2.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        <div className="space-y-1 text-sm">
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
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void rodarMatch()}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Continuar → Match Deezer
              </button>
            : null}
          </div>
        </div>
      : null}

      {activeStep >= 2 && matchResult ?
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm font-semibold">Passo 2–3 — Match e revisão</p>
            <p className="mt-1 text-xs text-slate-500">
              Aprovadas para download: {approvedCount} / {matchResult.rows.length}
              {skippedTracks.size > 0 ? ` · ${skippedTracks.size} pulada(s)` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Na dúvida: abra o link Deezer, compare com o MP3 legado no PC e escolha na lista — ou use{" "}
              <strong>Pular</strong> para não subir.
            </p>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Faixa legado</th>
                  <th className="px-3 py-2">Dur.</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Deezer</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {matchResult.rows.map((row) => {
                  const isSkipped = skippedTracks.has(row.relativePath);
                  const showPicker =
                    !isSkipped &&
                    row.candidates.length > 0 &&
                    (row.verdict === "pick" ||
                      row.verdict === "review" ||
                      row.verdict === "rejected" ||
                      row.verdict === "not_found");

                  return (
                  <tr key={row.relativePath} className={isSkipped ? "opacity-50" : undefined}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.searchLine}</div>
                      {row.normalizedSearchLine !== row.searchLine ?
                        <div className="text-[10px] text-violet-600">Busca: {row.normalizedSearchLine}</div>
                      : null}
                      <div className="text-[10px] text-slate-500">{row.relativePath}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDuration(row.legacyDurationSec)}</td>
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
                        {(matchDeezerUrl(row, matchPicks) ?? row.selected?.url) ?
                          <a
                            href={matchDeezerUrl(row, matchPicks) ?? row.selected?.url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border px-2 py-0.5 text-[10px] font-semibold dark:border-slate-700"
                          >
                            Ouvir Deezer
                          </a>
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {reviewRows.length > 0 ?
            <p className="text-xs text-amber-800">
              {reviewRows.length} faixa(s) precisam de escolha manual (passo 3).
            </p>
          : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!!busy || approvedCount === 0}
              onClick={() => void enfileirarDownloads()}
              className="rounded-lg bg-violet-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Passo 4 — Baixar via Deemix ({approvedCount} faixas)
            </button>
            <Link
              href="/criacao/download"
              className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold dark:border-slate-700"
            >
              Abrir Download link →
            </Link>
          </div>
        </div>
      : null}

      {activeStep === 5 ?
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">Passo 5 — Multi-Upload</p>
          <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-200/90">
            Cada faixa vai para a pasta/programação definida no passo 0 — sem escolher cliente manualmente.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-slate-600">Job Deemix (Download link)</span>
              <input
                value={downloadJobId ?? ""}
                onChange={(e) => setDownloadJobId(e.target.value.trim() || null)}
                placeholder="cole o ID do job se veio do Download link"
                className="w-64 rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <button
              type="button"
              disabled={!downloadJobId || !preview || !matchResult}
              onClick={() => irParaMultiUpload()}
              className="rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Multi-Upload → {approvedCount} faixa(s) · {preview?.rows.filter((r) => r.status === "ok").length ?? 0}{" "}
              pasta(s)
            </button>
            <Link
              href="/criacao/upload?servidorUp=1"
              onClick={() => downloadJobId && persistUploadSession(downloadJobId)}
              className="rounded-lg border border-emerald-400 px-5 py-2 text-sm font-semibold dark:border-emerald-700"
            >
              Abrir Upload (modo Servidor UP)
            </Link>
            <Link
              href="/criacao/fila"
              className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold dark:border-slate-700"
            >
              Fila de processamento →
            </Link>
          </div>
          {!matchResult ?
            <p className="mt-2 text-xs text-amber-800">Faça o match (passos 2–3) antes da subida.</p>
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
