"use client";

import { useRef, useState } from "react";
import { competenciaLabel } from "@/lib/criacao/competencia";
import type { AtlCricaExportManifest } from "@/lib/criacao/atlCricaHierarquiaService";
import type { AtlCricaImportPreview } from "@/lib/criacao/atlCricaImportService";
import {
  abrirProgramacoesAtlCrica,
  marcarSubidoAtlCrica,
  submitAtlCricaImportUpload,
} from "@/lib/criacao/atlCricaUploadClient";
import {
  buildFileMapFromFileList,
  buildFileMapFromZip,
  downloadAtlCricaHierarchyZip,
  listMp3PathsFromFileList,
  listMp3PathsFromZip,
  parseAtlManifestFromZip,
  readManifestFromFileList,
} from "@/lib/criacao/atlCricaZipClient";

export function AtlCricaImportExportSection({
  competencia,
  onDone,
}: {
  competencia: string;
  onDone: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<AtlCricaImportPreview | null>(null);
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; label?: string } | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  async function exportar() {
    setExporting(true);
    setMsg("");
    try {
      const q = competencia ? `?competencia=${encodeURIComponent(competencia)}` : "";
      const res = await fetch(`/api/criacao/atl-crica/export-hierarquia${q}`);
      const data = (await res.json()) as AtlCricaExportManifest & { error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao exportar.");
      if (data.blockExport) {
        setMsg(data.warnings.join(" "));
        return;
      }
      await downloadAtlCricaHierarchyZip(data);
      setMsg(
        `ZIP baixado: ${data.clientes.length} cliente(s), ${data.pastas.length} pasta(s) · ${competenciaLabel(data.competencia)}.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao exportar.");
    } finally {
      setExporting(false);
    }
  }

  async function analisarPaths(
    paths: Array<{ path: string }>,
    map: Map<string, File>,
    manifestLocal: AtlCricaExportManifest | null,
  ) {
    setMsg("");
    setPreview(null);
    const res = await fetch("/api/criacao/atl-crica/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competencia,
        manifest: manifestLocal,
        files: paths,
      }),
    });
    const data = (await res.json()) as AtlCricaImportPreview & { error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha na pré-visualização.");
    setPreview(data);
    setFileMap(map);
  }

  async function onFolderPicked(fileList: FileList | null) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      const paths = listMp3PathsFromFileList(fileList);
      const manifestLocal = await readManifestFromFileList(fileList);
      const map = buildFileMapFromFileList(fileList);
      await analisarPaths(paths, map, manifestLocal);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao ler pasta.");
    } finally {
      setImporting(false);
    }
  }

  async function onZipPicked(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const paths = await listMp3PathsFromZip(file);
      const manifestLocal = await parseAtlManifestFromZip(file);
      const map = await buildFileMapFromZip(file);
      await analisarPaths(paths, map, manifestLocal);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao ler ZIP.");
    } finally {
      setImporting(false);
    }
  }

  async function confirmarImport() {
    if (!preview || preview.stats.totalFiles === 0) return;
    setImporting(true);
    setMsg("");
    setProgress(null);
    try {
      await abrirProgramacoesAtlCrica(preview.programacaoIds);

      const lotesResolvidos = preview.lotes.map((l) => ({
        clienteRef: l.clienteRef,
        clienteNome: l.clienteNome,
        programacaoId: l.programacaoId,
        programacaoNome: l.programacaoNome,
        pastaId: l.pastaId,
        pastaNome: l.pastaNome,
        criativoUserId: l.criativoUserId,
        arquivos: l.paths.map((p) => fileMap.get(p)).filter((f): f is File => Boolean(f)),
      }));

      const up = await submitAtlCricaImportUpload({
        titulo: `ATL CRICA import · ${competenciaLabel(preview.competencia)}`,
        competencia: preview.competencia,
        lotes: lotesResolvidos.filter((l) => l.arquivos.length > 0),
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      if (!up.ok) throw new Error(up.error);

      await marcarSubidoAtlCrica(preview.programacaoIds, preview.competencia);
      setPreview(null);
      setFileMap(new Map());
      setMsg(`Import concluído — ${preview.stats.totalFiles} faixa(s) enfileirada(s).`);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao importar.");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">1 · Exportar hierarquia</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Baixa um ZIP com pastas vazias <code className="text-[10px]">Cliente/Programação/Pasta</code> e o manifesto
          para o mês {competenciaLabel(competencia)}.
        </p>
        <button
          type="button"
          disabled={exporting || !competencia}
          onClick={() => void exportar()}
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {exporting ? "Gerando ZIP…" : "Exportar hierarquia ATL"}
        </button>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">2 · Importar pasta preenchida</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Depois de colocar os MP3s no Mac, envie o <strong>ZIP exportado</strong> de volta (com{" "}
          <code className="text-[10px]">atl-manifest.json</code>). Cada pasta recebe tag do dono da programação, ex.{" "}
          <strong>[LA] Bossa Jazzy</strong>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={folderRef}
            type="file"
            className="hidden"
            multiple
            {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => void onFolderPicked(e.target.files)}
          />
          <input
            ref={zipRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => void onZipPicked(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => folderRef.current?.click()}
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
          >
            Selecionar pasta…
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => zipRef.current?.click()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-700"
          >
            Enviar ZIP…
          </button>
        </div>

        {preview ?
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
            <p className="font-semibold">
              {preview.stats.totalFiles} faixa(s) · {preview.stats.totalPastas} pasta(s) ·{" "}
              {preview.stats.totalClientes} cliente(s)
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="mt-1 text-amber-700 dark:text-amber-300">
                {w}
              </p>
            ))}
            <button
              type="button"
              disabled={importing || preview.stats.totalFiles === 0}
              onClick={() => void confirmarImport()}
              className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {importing ? "Enviando…" : "Confirmar importação"}
            </button>
          </div>
        : null}

        {progress ?
          <p className="mt-2 text-xs text-slate-500">
            Upload {progress.done}/{progress.total}
            {progress.label ? ` · ${progress.label}` : ""}
          </p>
        : null}
      </div>

      {msg ?
        <p className="md:col-span-2 text-sm text-slate-700 dark:text-slate-300">{msg}</p>
      : null}
    </section>
  );
}
