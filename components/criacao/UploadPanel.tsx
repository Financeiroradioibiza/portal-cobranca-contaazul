"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CriativoTagSelect, formatTagChipPreview } from "@/components/criacao/CriativoTagSelect";
import { ServidorUpMultiUploadPanel } from "@/components/criacao/ServidorUpMultiUploadPanel";
import { defaultUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";
import {
  groupStagingByJob,
  isInvalidStagingMp3,
  type StagingFileRow,
  type StagingJobGroup,
} from "@/lib/criacao/downloadService";
import Link from "next/link";
import { readServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";

import {
  CriacaoClienteNomeComTag,
  criacaoClienteRowClass,
  type CriacaoClienteRow,
} from "@/components/criacao/CriacaoClienteTag";
import type { RioTagCobranca } from "@/lib/rio/rioTagCobranca";
import { rioTagCobrancaRowBgClass } from "@/lib/rio/rioTagCobranca";

type Cliente = CriacaoClienteRow & { pdvCount: number; tagCobranca?: RioTagCobranca };
type ArvorePasta = { id: string; nome: string; velocidade: string; musicasCount: number };
type ArvoreProg = { id: string; nome: string; pastas: ArvorePasta[] };
type PickedFile =
  | { source: "local"; nome: string; sizeBytes: number; file: File }
  | { source: "staging"; nome: string; sizeBytes: number; downloadItemId: string; label: string };
type Ticket = { itemId: string; arquivoNome: string; token: string; exp: number };
type DestinoTipo = "pasta" | "biblioteca" | "pasta_especial";
type PastaEspecialOpt = { id: string; nome: string };

type UploadLote = {
  id: string;
  destinoTipo: DestinoTipo;
  clienteSel: Cliente | null;
  clienteBusca: string;
  arvore: ArvoreProg[];
  progSel: string;
  pastaSel: string;
  pastaEspecialSel: string;
  tagCriativoUserId: string;
  tagCriativoIniciais: string;
  uploadTag: string;
  files: PickedFile[];
};

function newLote(): UploadLote {
  return {
    id: crypto.randomUUID(),
    destinoTipo: "pasta",
    clienteSel: null,
    clienteBusca: "",
    arvore: [],
    progSel: "",
    pastaSel: "",
    pastaEspecialSel: "",
    tagCriativoUserId: "",
    tagCriativoIniciais: "",
    uploadTag: defaultUploadCompetenciaTag(),
    files: [],
  };
}

function formatBytes(b: number): string {
  if (!b) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function loteLabel(l: UploadLote, pastasEspeciais: PastaEspecialOpt[] = []): string {
  if (l.destinoTipo === "biblioteca") {
    return l.uploadTag.trim() ? `Biblioteca · ${l.uploadTag.trim()}` : "Biblioteca (defina a tag)";
  }
  if (l.destinoTipo === "pasta_especial") {
    const pe = pastasEspeciais.find((p) => p.id === l.pastaEspecialSel);
    const base = pe ? `Pasta especial · ${pe.nome}` : "Pasta especial — escolha qual";
    return l.uploadTag.trim() ? `${base} · ${l.uploadTag.trim()}` : base;
  }
  if (!l.clienteSel) return "Pasta — escolha o cliente";
  const prog = l.arvore.find((p) => p.id === l.progSel);
  const pasta = prog?.pastas.find((p) => p.id === l.pastaSel);
  if (pasta) return `${l.clienteSel!.nome} · ${prog?.nome ?? ""} / ${pasta.nome}${l.uploadTag.trim() ? ` · ${l.uploadTag.trim()}` : ""}`;
  if (prog) return `${l.clienteSel.nome} · ${prog.nome} — escolha a pasta`;
  return `${l.clienteSel.nome} — escolha programação e pasta`;
}

export function UploadPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const servidorUpMode = searchParams.get("servidorUp") === "1";
  const [titulo, setTitulo] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [lotes, setLotes] = useState<UploadLote[]>(() => [newLote()]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; lote?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [stagingGroups, setStagingGroups] = useState<StagingJobGroup[]>([]);
  const [stagingLoading, setStagingLoading] = useState(true);
  const [pastasEspeciais, setPastasEspeciais] = useState<PastaEspecialOpt[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingLoteId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/criacao/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.clientes) setClientes(d.clientes as Cliente[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStaging = useCallback(async () => {
    try {
      const res = await fetch("/api/criacao/download?view=staging");
      if (!res.ok) return;
      const data = (await res.json()) as { staging?: StagingFileRow[] };
      setStagingGroups(groupStagingByJob(data.staging ?? []));
    } catch {
      /* ignore */
    } finally {
      setStagingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaging();
  }, [loadStaging]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/criacao/pastas-especiais")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.pastas) {
          setPastasEspeciais(
            (d.pastas as PastaEspecialOpt[]).map((p) => ({ id: p.id, nome: p.nome })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (servidorUpMode) return;
    if (readServidorUpUploadSession()) {
      router.replace("/criacao/upload?servidorUp=1");
    }
  }, [servidorUpMode, router]);

  const updateLote = useCallback((id: string, patch: Partial<UploadLote>) => {
    setLotes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const loadArvore = useCallback(async (loteId: string, cliente: Cliente) => {
    try {
      const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(cliente.ref)}/arvore`);
      const d = res.ok ? ((await res.json()) as { arvore?: ArvoreProg[] }) : null;
      updateLote(loteId, { arvore: d?.arvore ?? [], progSel: "", pastaSel: "" });
    } catch {
      updateLote(loteId, { arvore: [], progSel: "", pastaSel: "" });
    }
  }, [updateLote]);

  const addFilesToLote = useCallback((loteId: string, list: FileList | null) => {
    if (!list) return;
    const next: PickedFile[] = [];
    for (const f of Array.from(list)) {
      if (!/\.mp3$/i.test(f.name) && !f.type.includes("audio")) continue;
      next.push({ source: "local", nome: f.name, sizeBytes: f.size, file: f });
    }
    setLotes((prev) =>
      prev.map((l) => {
        if (l.id !== loteId) return l;
        const seen = new Set(
          l.files.map((p) => (p.source === "staging" ? `staging:${p.downloadItemId}` : p.nome)),
        );
        return {
          ...l,
          files: [
            ...l.files,
            ...next.filter((n) => !seen.has(n.source === "staging" ? `staging:${n.downloadItemId}` : n.nome)),
          ],
        };
      }),
    );
  }, []);

  const addStagingGroupToLote = useCallback((loteId: string, group: StagingJobGroup) => {
    const valid = group.tracks.filter((t) => !isInvalidStagingMp3(t.sizeBytes));
    const skipped = group.tracks.length - valid.length;
    if (valid.length === 0) {
      setMsg(
        skipped > 0 ?
          "Nenhuma faixa válida neste lote — todos os arquivos têm ~1 KB (download Deemix falhou). Refaça no Download link."
        : "Lote vazio.",
      );
      return;
    }
    if (skipped > 0) {
      setMsg(`${skipped} faixa(s) ignorada(s) por arquivo inválido (~1 KB). Importadas só as válidas.`);
    }
    setLotes((prev) =>
      prev.map((l) => {
        if (l.id !== loteId) return l;
        const seen = new Set(
          l.files.map((p) => (p.source === "staging" ? p.downloadItemId : p.nome)),
        );
        const next = valid
          .filter((t) => !seen.has(t.id))
          .map((t) => {
            const nome =
              t.arquivoNome.trim() ||
              `${t.artista.trim() ? `${t.artista.trim()} - ` : ""}${t.titulo.trim() || "faixa"}.mp3`;
            return {
              source: "staging" as const,
              nome: nome.slice(0, 500),
              sizeBytes: t.sizeBytes ?? 0,
              downloadItemId: t.id,
              label: t.titulo || t.arquivoNome || nome,
            };
          });
        return { ...l, files: [...l.files, ...next] };
      }),
    );
  }, []);

  const totalFiles = useMemo(() => lotes.reduce((n, l) => n + l.files.length, 0), [lotes]);

  function validateLotes(): string | null {
    if (totalFiles === 0) return "Adicione ao menos um MP3 em algum lote.";
    for (const l of lotes) {
      if (l.files.length === 0) continue;
      if (l.destinoTipo === "biblioteca") {
        if (!l.uploadTag.trim()) return `Defina a tag criativa do lote «${loteLabel(l, pastasEspeciais)}».`;
        continue;
      }
      if (l.destinoTipo === "pasta_especial") {
        if (!l.pastaEspecialSel) return "Escolha a pasta especial em cada lote com arquivos.";
        if (!l.uploadTag.trim()) {
          return `Defina a tag criativa em «${loteLabel(l, pastasEspeciais)}» — as faixas vão para a biblioteca e ficam difíceis de achar sem tag.`;
        }
        continue;
      }
      if (!l.clienteSel) return "Escolha o cliente em cada lote com arquivos.";
      if (!l.progSel || !l.pastaSel) return `Escolha programação e pasta em «${loteLabel(l, pastasEspeciais)}».`;
      if (!l.uploadTag.trim()) {
        return `Defina a tag criativa em «${loteLabel(l, pastasEspeciais)}» — as faixas vão para a biblioteca e ficam difíceis de achar sem tag.`;
      }
    }
    const withFiles = lotes.filter((l) => l.files.length > 0);
    if (withFiles.length === 0) return "Nenhum lote com arquivos.";
    for (const l of withFiles) {
      const bad = l.files.filter((f) => f.source === "staging" && isInvalidStagingMp3(f.sizeBytes));
      if (bad.length > 0) {
        return `${bad.length} faixa(s) do servidor com arquivo inválido (~1 KB) — remova e refaça o download no Download link.`;
      }
    }
    return null;
  }

  async function submit() {
    const err = validateLotes();
    if (err) {
      setMsg(err);
      return;
    }
    setSubmitting(true);
    setMsg(null);

    const lotesComArquivos = lotes.filter((l) => l.files.length > 0);
    const totalUpload = lotesComArquivos.reduce((n, l) => n + l.files.length, 0);
    setProgress({ done: 0, total: totalUpload });

    try {
      const res = await fetch("/api/criacao/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim() || undefined,
          lotes: lotesComArquivos.map((l, i) => ({
            titulo:
              titulo.trim() ||
              (l.destinoTipo === "pasta" && l.clienteSel ?
                `${l.clienteSel.nome} · ${l.arvore.find((p) => p.id === l.progSel)?.pastas.find((p) => p.id === l.pastaSel)?.nome ?? "pasta"}`
              : l.destinoTipo === "pasta_especial" ?
                loteLabel(l, pastasEspeciais)
              : l.uploadTag.trim() ?
                `Biblioteca · ${l.uploadTag.trim()}`
              : `Upload ${i + 1}`),
            destinoTipo: l.destinoTipo,
            clienteRef: l.clienteSel?.ref,
            clienteNome: l.clienteSel?.nome,
            programacaoId: l.progSel || undefined,
            pastaId: l.pastaSel || undefined,
            pastaEspecialId: l.destinoTipo === "pasta_especial" ? l.pastaEspecialSel || undefined : undefined,
            uploadTagNome: l.uploadTag.trim() || undefined,
            tagCriativoUserId: l.tagCriativoUserId || undefined,
            arquivos: l.files.map((f) =>
              f.source === "staging" ?
                { nome: f.nome, sizeBytes: f.sizeBytes, downloadItemId: f.downloadItemId }
              : { nome: f.nome, sizeBytes: f.sizeBytes },
            ),
          })),
        }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        setMsg(
          errData?.error === "staging_item_invalido" ?
            "Uma ou mais faixas do servidor já foram importadas ou não existem mais."
          : errData?.error === "staging_import_falhou" && errData.message ?
            `Importação do servidor falhou: ${errData.message}`
          : "Não foi possível criar os jobs de processamento.",
        );
        setSubmitting(false);
        setProgress(null);
        return;
      }
      const data = (await res.json()) as {
        ingestUrl: string;
        stagingImported?: number;
        stagingErrors?: string[];
        jobs: Array<{ jobId: string; titulo: string; tickets: Ticket[] }>;
      };

      const pastasByProg = new Map<string, Set<string>>();
      for (const l of lotesComArquivos) {
        if (l.destinoTipo === "pasta" && l.progSel && l.pastaSel) {
          const set = pastasByProg.get(l.progSel) ?? new Set<string>();
          set.add(l.pastaSel);
          pastasByProg.set(l.progSel, set);
        }
      }
      for (const [progId, pastaIds] of pastasByProg) {
        const key = `criacao-pastas-abertas:${progId}`;
        let prev: string[] = [];
        try {
          prev = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
        } catch {
          prev = [];
        }
        sessionStorage.setItem(key, JSON.stringify([...new Set([...(Array.isArray(prev) ? prev : []), ...pastaIds])]));
      }

      const falhas: string[] = [];
      let done = 0;
      for (let i = 0; i < lotesComArquivos.length; i++) {
        const lote = lotesComArquivos[i]!;
        const job = data.jobs[i];
        if (!job) {
          falhas.push(...lote.files.map((f) => f.nome));
          continue;
        }
        const ticketByNome = new Map(job.tickets.map((t) => [t.arquivoNome, t]));
        setProgress({ done, total: totalUpload, lote: loteLabel(lote, pastasEspeciais) });
        for (const f of lote.files) {
          if (f.source === "staging") {
            done += 1;
            setProgress({ done, total: totalUpload, lote: loteLabel(lote, pastasEspeciais) });
            continue;
          }
          const ticket = ticketByNome.get(f.nome.slice(0, 500));
          if (!ticket) {
            falhas.push(f.nome);
            done += 1;
            setProgress({ done, total: totalUpload, lote: loteLabel(lote, pastasEspeciais) });
            continue;
          }
          const fd = new FormData();
          fd.append("token", ticket.token);
          fd.append("file", f.file, f.nome);
          try {
            const up = await fetch(data.ingestUrl, { method: "POST", body: fd });
            if (!up.ok) falhas.push(f.nome);
          } catch {
            falhas.push(f.nome);
          }
          done += 1;
          setProgress({ done, total: totalUpload, lote: loteLabel(lote, pastasEspeciais) });
        }
      }

      if (falhas.length > 0) {
        setMsg(
          `${totalUpload - falhas.length}/${totalUpload} enviados. Falharam: ${falhas.slice(0, 5).join(", ")}${falhas.length > 5 ? "…" : ""}`,
        );
        setSubmitting(false);
        setProgress(null);
        return;
      }
      if ((data.stagingErrors?.length ?? 0) > 0) {
        setMsg(
          `${data.stagingImported ?? 0} faixa(s) importadas do servidor. Avisos: ${data.stagingErrors!.slice(0, 3).join(" · ")}`,
        );
      }
      if (pastasByProg.size === 1) {
        sessionStorage.setItem("criacao-open-prog", [...pastasByProg.keys()][0]!);
        router.push("/criacao/programacoes");
      } else {
        router.push("/criacao/fila");
      }
    } catch {
      setMsg("Não foi possível criar os jobs de processamento.");
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-3 py-6 sm:px-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        multiple
        hidden
        onChange={(e) => {
          const id = pendingLoteId.current;
          pendingLoteId.current = null;
          if (id) addFilesToLote(id, e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Upload</div>
        <h1 className="text-2xl font-bold tracking-tight">Upload de músicas 192k</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {servidorUpMode ?
            "Fluxo Servidor UP: importe lotes do Download link e distribua cada faixa na pasta correta do cliente."
          : "Monte vários lotes na mesma tela — pastas de clientes diferentes, tags na biblioteca — e envie tudo com um clique."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/criacao/upload")}
            className={
              "rounded-lg px-4 py-2 text-sm font-semibold " +
              (!servidorUpMode ?
                "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "border-2 border-slate-300 dark:border-slate-600")
            }
          >
            Upload comum
          </button>
          <button
            type="button"
            onClick={() => router.push("/criacao/upload?servidorUp=1")}
            className={
              "rounded-lg px-4 py-2 text-sm font-semibold " +
              (servidorUpMode ?
                "bg-violet-900 text-white ring-2 ring-violet-400"
              : "border-2 border-violet-400 bg-violet-100 text-violet-950 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-100")
            }
          >
            Multi-Upload (Servidor UP)
          </button>
          {servidorUpMode ?
            <Link
              href="/criacao/multi-upload-legado"
              className="rounded-lg border-2 border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-600 dark:text-emerald-100"
            >
              Página Multi-Upload legado →
            </Link>
          : null}
        </div>
      </div>

      {servidorUpMode ?
        <ServidorUpMultiUploadPanel />
      : null}

      {!servidorUpMode ?
        <>
      <div className="mb-5">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Título geral do envio (opcional)</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Virada junho — Casa Rua"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
      </div>

      <div className="space-y-4">
        {lotes.map((lote, idx) => (
          <LoteCard
            key={lote.id}
            index={idx}
            lote={lote}
            clientes={clientes}
            pastasEspeciais={pastasEspeciais}
            canRemove={lotes.length > 1}
            onUpdate={(patch) => updateLote(lote.id, patch)}
            onRemove={() => setLotes((prev) => prev.filter((l) => l.id !== lote.id))}
            onPickCliente={(c) => {
              updateLote(lote.id, { clienteSel: c, clienteBusca: "", progSel: "", pastaSel: "" });
              void loadArvore(lote.id, c);
            }}
            onClearCliente={() => updateLote(lote.id, { clienteSel: null, arvore: [], progSel: "", pastaSel: "" })}
            onAddFiles={(files) => addFilesToLote(lote.id, files)}
            onPickFilesClick={() => {
              pendingLoteId.current = lote.id;
              fileInputRef.current?.click();
            }}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLotes((prev) => [...prev, newLote()])}
          className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
        >
          + Outra pasta, tag ou cliente
        </button>
      </div>

      {msg ? <div className="mt-3 text-sm text-red-600">{msg}</div> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || totalFiles === 0}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ?
            progress ?
              `Enviando ${progress.done}/${progress.total}${progress.lote ? ` · ${progress.lote}` : ""}…`
            : "Preparando…"
          : "Subir para a fila"}
        </button>
        <span className="text-xs text-slate-400">
          {lotes.filter((l) => l.files.length > 0).length} lote(s) · {totalFiles} MP3
        </span>
      </div>
        </>
      : null}
    </div>
  );
}

function LoteCard({
  index,
  lote,
  clientes,
  pastasEspeciais,
  canRemove,
  onUpdate,
  onRemove,
  onPickCliente,
  onClearCliente,
  onAddFiles,
  onPickFilesClick,
}: {
  index: number;
  lote: UploadLote;
  clientes: Cliente[];
  pastasEspeciais: PastaEspecialOpt[];
  canRemove: boolean;
  onUpdate: (patch: Partial<UploadLote>) => void;
  onRemove: () => void;
  onPickCliente: (c: Cliente) => void;
  onClearCliente: () => void;
  onAddFiles: (files: FileList | null) => void;
  onPickFilesClick: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const pastasDisponiveis = useMemo(() => {
    const prog = lote.arvore.find((p) => p.id === lote.progSel);
    return prog?.pastas ?? [];
  }, [lote.arvore, lote.progSel]);

  const clientesFiltrados = useMemo(() => {
    const q = lote.clienteBusca.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes;
    return base.slice(0, 40);
  }, [clientes, lote.clienteBusca]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Lote {index + 1}</div>
          <div className="text-sm font-semibold">{loteLabel(lote, pastasEspeciais)}</div>
        </div>
        {canRemove ?
          <button type="button" onClick={onRemove} className="text-xs text-slate-400 hover:text-red-600">
            Remover lote
          </button>
        : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onUpdate({ destinoTipo: "pasta", pastaEspecialSel: "" })}
          className={
            "rounded-lg px-3 py-1.5 text-xs font-semibold " +
            (lote.destinoTipo === "pasta" ?
              "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "border border-slate-200 text-slate-500 dark:border-slate-700")
          }
        >
          Pasta de programação
        </button>
        <button
          type="button"
          onClick={() =>
            onUpdate({
              destinoTipo: "pasta_especial",
              clienteSel: null,
              arvore: [],
              progSel: "",
              pastaSel: "",
            })
          }
          className={
            "rounded-lg px-3 py-1.5 text-xs font-semibold " +
            (lote.destinoTipo === "pasta_especial" ?
              "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "border border-slate-200 text-slate-500 dark:border-slate-700")
          }
        >
          Pasta especial
        </button>
        <button
          type="button"
          onClick={() =>
            onUpdate({ destinoTipo: "biblioteca", clienteSel: null, arvore: [], progSel: "", pastaSel: "", pastaEspecialSel: "" })
          }
          className={
            "rounded-lg px-3 py-1.5 text-xs font-semibold " +
            (lote.destinoTipo === "biblioteca" ?
              "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "border border-slate-200 text-slate-500 dark:border-slate-700")
          }
        >
          Tag na biblioteca (sem pasta)
        </button>
      </div>

      {lote.destinoTipo === "pasta_especial" ?
        <div className="mb-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Pasta especial destino</span>
            <select
              value={lote.pastaEspecialSel}
              onChange={(e) => onUpdate({ pastaEspecialSel: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Selecione…</option>
              {pastasEspeciais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          {pastasEspeciais.length === 0 ?
            <p className="mt-1 text-[10px] text-slate-400">
              Nenhuma pasta especial cadastrada — crie em{" "}
              <Link href="/criacao/pastas-especiais" className="underline">
                Pastas Especiais
              </Link>
              .
            </p>
          : null}
        </div>
      : lote.destinoTipo === "biblioteca" ?
        null
      : <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Cliente</span>
            {lote.clienteSel ?
              <div
                className={
                  "flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 " +
                  rioTagCobrancaRowBgClass(lote.clienteSel.tagCobranca)
                }
              >
                <CriacaoClienteNomeComTag
                  nome={lote.clienteSel.nome}
                  tagCobranca={lote.clienteSel.tagCobranca}
                  className="truncate text-sm font-medium"
                />
                <button type="button" onClick={onClearCliente} className="text-xs text-slate-400 hover:text-slate-600">
                  trocar
                </button>
              </div>
            : <>
                <input
                  value={lote.clienteBusca}
                  onChange={(e) => onUpdate({ clienteBusca: e.target.value })}
                  placeholder="Buscar cliente…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                {lote.clienteBusca.trim() && clientesFiltrados.length > 0 ?
                  <div className="mt-1 max-h-36 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    {clientesFiltrados.map((c) => (
                      <button
                        type="button"
                        key={c.ref}
                        onClick={() => onPickCliente(c)}
                        className={
                          "flex w-full items-center justify-between px-3 py-2 text-left " +
                          criacaoClienteRowClass(c.tagCobranca, false)
                        }
                      >
                        <CriacaoClienteNomeComTag
                          nome={c.nome}
                          tagCobranca={c.tagCobranca}
                          className="truncate"
                        />
                        <span className="ml-2 shrink-0 text-xs text-slate-400">{c.pdvCount} PDV</span>
                      </button>
                    ))}
                  </div>
                : null}
              </>
            }
          </div>
          {lote.clienteSel ?
            <>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Programação</span>
                <select
                  value={lote.progSel}
                  onChange={(e) => onUpdate({ progSel: e.target.value, pastaSel: "" })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Selecione…</option>
                  {lote.arvore.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Pasta destino</span>
                <select
                  value={lote.pastaSel}
                  onChange={(e) => onUpdate({ pastaSel: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Selecione…</option>
                  {pastasDisponiveis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.musicasCount} faixas)
                    </option>
                  ))}
                </select>
              </label>
            </>
          : null}
        </div>
      }

      <div className="mb-3 space-y-0">
        <CriativoTagSelect
          value={lote.tagCriativoUserId}
          onChange={(v) => onUpdate({ tagCriativoUserId: v })}
          onSelected={(c) => onUpdate({ tagCriativoIniciais: c?.tagIniciais ?? "" })}
          help={
            lote.destinoTipo === "biblioteca" ?
              "Quem define iniciais e cor da tag neste lote."
            : lote.destinoTipo === "pasta_especial" ?
              "Quem define iniciais e cor da tag neste lote."
            : "Quem define iniciais e cor da tag neste lote (pode ser diferente em cada pasta)."
          }
        />
        <TagCriativaField
          value={lote.uploadTag}
          tagCriativoIniciais={lote.tagCriativoIniciais}
          onChange={(v) => onUpdate({ uploadTag: v })}
          hint={
            lote.destinoTipo === "biblioteca" ?
              "As faixas entram só na biblioteca com esta tag."
            : lote.destinoTipo === "pasta_especial" ?
              "Obrigatória — após processar, as faixas vão para a biblioteca e para a pasta especial escolhida."
            : "Obrigatória — após processar, as faixas vão para a pasta do cliente e para a biblioteca com esta tag."
          }
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onAddFiles(e.dataTransfer.files);
        }}
        onClick={onPickFilesClick}
        className={
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition " +
          (dragOver ?
            "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800"
          : "border-slate-300 hover:border-slate-400 dark:border-slate-700")
        }
      >
        <div className="text-2xl">🎵</div>
        <div className="mt-1 text-sm font-semibold">Arraste MP3 aqui ou clique</div>
        <div className="mt-0.5 text-xs text-slate-500">192 kbps recomendado</div>
      </div>

      {lote.files.length > 0 ?
        <ul className="mt-3 max-h-48 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {lote.files.map((f) => (
            <li
              key={f.source === "staging" ? `staging:${f.downloadItemId}` : f.nome}
              className="flex items-center justify-between px-3 py-1.5 text-sm"
            >
              <span className="truncate">
                {f.source === "staging" ?
                  <span className="mr-1 rounded bg-violet-100 px-1 text-[10px] font-bold uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                    servidor
                  </span>
                : null}
                {f.source === "staging" ? f.label : f.nome}
              </span>
              <span className="ml-2 flex shrink-0 items-center gap-2">
                <span
                  className={
                    "text-xs " +
                    (f.source === "staging" && isInvalidStagingMp3(f.sizeBytes) ?
                      "font-semibold text-red-600 dark:text-red-400"
                    : "text-slate-400")
                  }
                >
                  {formatBytes(f.sizeBytes)}
                  {f.source === "staging" && isInvalidStagingMp3(f.sizeBytes) ? " · inválido" : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      files: lote.files.filter((x) =>
                        f.source === "staging" && x.source === "staging" ?
                          x.downloadItemId !== f.downloadItemId
                        : x.source === "local" && f.source === "local" ?
                          x.nome !== f.nome
                        : true,
                      ),
                    })
                  }
                  className="text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      : null}
    </div>
  );
}

function TagCriativaField({
  value,
  tagCriativoIniciais,
  onChange,
  hint,
}: {
  value: string;
  tagCriativoIniciais: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block text-xs font-semibold text-slate-500">Tag criativa (ex.: VOGUE, POP 90s)</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={formatTagChipPreview(tagCriativoIniciais, value.trim() || "VOGUE")}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
      {hint ?
        <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
      : null}
    </label>
  );
}
