"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlaylistDownloadManifest } from "@/lib/criacao/playlistDownloadService";
import {
  downloadPlaylistAsZip,
  type PlaylistZipProgress,
} from "@/lib/criacao/playlistZipClient";
import { playlistZipPartCount, PLAYLIST_ZIP_TRACKS_PER_PART } from "@/lib/criacao/playlistZipLimits";

type Cliente = { ref: string; nome: string; pdvCount: number };

type ArvoreProg = {
  id: string;
  nome: string;
  pastas: Array<{ id: string; nome: string; musicasCount: number }>;
};

export function BaixarPlaylistsPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [arvore, setArvore] = useState<ArvoreProg[]>([]);
  const [loadingArvore, setLoadingArvore] = useState(false);
  const [progSel, setProgSel] = useState<ArvoreProg | null>(null);
  const [manifest, setManifest] = useState<PlaylistDownloadManifest | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [masterOk, setMasterOk] = useState(true);
  const [downloadMode, setDownloadMode] = useState<"cloud3" | "unavailable" | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<PlaylistZipProgress | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/criacao/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.clientes) setClientes(d.clientes as Cliente[]);
      })
      .finally(() => setLoadingClientes(false));
  }, []);

  const loadArvore = useCallback(async (ref: string) => {
    setLoadingArvore(true);
    setProgSel(null);
    setManifest(null);
    try {
      const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(ref)}/arvore`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { arvore: ArvoreProg[] };
      setArvore(data.arvore ?? []);
    } catch {
      setArvore([]);
    } finally {
      setLoadingArvore(false);
    }
  }, []);

  useEffect(() => {
    if (clienteSel) void loadArvore(clienteSel.ref);
    else {
      setArvore([]);
      setProgSel(null);
      setManifest(null);
    }
  }, [clienteSel, loadArvore]);

  const loadManifest = useCallback(async (programacaoId: string) => {
    setLoadingManifest(true);
    setErro(null);
    setManifest(null);
    try {
      const res = await fetch(`/api/criacao/baixar-playlists/${encodeURIComponent(programacaoId)}`);
      const data = (await res.json()) as {
        manifest?: PlaylistDownloadManifest;
        masterDownloadEnabled?: boolean;
        downloadMode?: "cloud3" | "unavailable";
        error?: string;
      };
      if (!res.ok || !data.manifest) {
        setErro(data.error === "not_found" ? "Programação não encontrada." : "Falha ao carregar.");
        return;
      }
      setDownloadMode(data.downloadMode ?? (data.masterDownloadEnabled ? "cloud3" : "unavailable"));
      setMasterOk(Boolean(data.masterDownloadEnabled));
      setManifest(data.manifest);
    } catch {
      setErro("Falha ao carregar programação.");
    } finally {
      setLoadingManifest(false);
    }
  }, []);

  useEffect(() => {
    if (progSel) void loadManifest(progSel.id);
    else setManifest(null);
  }, [progSel, loadManifest]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes;
    return [...base].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [clientes, clienteBusca]);

  const totalMusicasProg = useMemo(() => {
    if (!progSel) return 0;
    return progSel.pastas.reduce((acc, p) => acc + p.musicasCount, 0);
  }, [progSel]);

  const zipPartCount = useMemo(() => {
    if (!manifest) return 0;
    return playlistZipPartCount(manifest.baixaveis);
  }, [manifest]);

  async function handleDownload() {
    if (!manifest || downloading) return;
    if (manifest.baixaveis === 0) {
      alert("Nenhuma faixa com master 192 kbps no B2 nesta programação.");
      return;
    }
    const parts = playlistZipPartCount(manifest.baixaveis);
    const partsMsg =
      parts > 1 ?
        `\n\nSerão ${parts} arquivos ZIP (até ${PLAYLIST_ZIP_TRACKS_PER_PART} faixas cada: -zip1, -zip2…). Permita downloads múltiplos no browser se o sistema pedir.`
      : "";
    if (
      manifest.omitidas > 0 &&
      !window.confirm(
        `${manifest.omitidas} faixa(s) sem master no B2 serão omitidas. Continuar com ${manifest.baixaveis} faixa(s)?${partsMsg}`,
      )
    ) {
      return;
    }
    if (
      manifest.omitidas === 0 &&
      parts > 1 &&
      !window.confirm(
        `${manifest.baixaveis} faixa(s) → ${parts} ZIPs (até ${PLAYLIST_ZIP_TRACKS_PER_PART} faixas cada). Continuar?${partsMsg}`,
      )
    ) {
      return;
    }
    setDownloading(true);
    setProgress({ phase: "fetching", done: 0, total: manifest.baixaveis });
    setErro(null);
    try {
      await downloadPlaylistAsZip(manifest, setProgress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("fetch_failed")) {
        const parts = msg.split(":");
        const status = parts[2] ?? "?";
        const titulo = parts.slice(3).join(":") || "faixa";
        if (status === "401" || status === "403") {
          setErro(
            `cloud3 recusou (HTTP ${status}) — faça deploy do worker: bash scripts/deploy-cf-audio-worker.sh`,
          );
        } else if (status === "404") {
          setErro(`Master 192k ausente no B2: «${titulo}».`);
        } else if (status === "network") {
          setErro(`Falha de rede ao baixar «${titulo}» via cloud3.`);
        } else {
          setErro(`Falha ao baixar «${titulo}» (HTTP ${status}).`);
        }
      } else {
        setErro(msg);
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="w-full min-w-0 px-1 py-2 sm:px-2">
      <header className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Criação</div>
        <h1 className="text-lg font-bold leading-tight">Baixar Playlists</h1>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          Escolha cliente e programação. O ZIP mantém a ordem das pastas e faixas (ex.:{" "}
          <span className="font-medium text-slate-600 dark:text-slate-300">
            Cliente / PADRÃO / POP, BRASIL, COOL
          </span>
          ) em master <strong>192 kbps</strong> (cloud3 → Backblaze B2).
        </p>
      </header>

      {downloadMode === "unavailable" || !masterOk ?
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Download desabilitado — configure <code>CRIACAO_INGEST_SECRET</code> no Netlify (mesmo do cloud2).
        </div>
      : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">1. Cliente</h2>
          <input
            type="search"
            value={clienteBusca}
            onChange={(e) => setClienteBusca(e.target.value)}
            placeholder="Buscar cliente…"
            className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          {loadingClientes ?
            <p className="text-xs text-slate-500">Carregando…</p>
          : <ul className="max-h-56 overflow-auto rounded border border-slate-100 dark:border-slate-800">
              {clientesFiltrados.map((c) => (
                <li key={c.ref}>
                  <button
                    type="button"
                    onClick={() => setClienteSel(c)}
                    className={
                      "block w-full px-2 py-1.5 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-950/40 " +
                      (clienteSel?.ref === c.ref ?
                        "bg-violet-100 font-semibold dark:bg-violet-950/60"
                      : "")
                    }
                  >
                    {c.nome}
                    <span className="ml-1 text-[10px] text-slate-400">{c.pdvCount} PDV(s)</span>
                  </button>
                </li>
              ))}
            </ul>
          }
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">2. Programação</h2>
          {!clienteSel ?
            <p className="text-xs text-slate-500">Selecione um cliente.</p>
          : loadingArvore ?
            <p className="text-xs text-slate-500">Carregando programações…</p>
          : arvore.length === 0 ?
            <p className="text-xs text-slate-500">Nenhuma programação neste cliente.</p>
          : <ul className="max-h-56 overflow-auto rounded border border-slate-100 dark:border-slate-800">
              {arvore.map((p) => {
                const count = p.pastas.reduce((a, f) => a + f.musicasCount, 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProgSel(p)}
                      className={
                        "block w-full px-2 py-1.5 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/40 " +
                        (progSel?.id === p.id ?
                          "bg-emerald-100 font-semibold dark:bg-emerald-950/60"
                        : "")
                      }
                    >
                      {p.nome}
                      <span className="ml-1 text-[10px] text-slate-400">
                        {p.pastas.length} pasta(s) · {count} faixa(s)
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          }
        </section>
      </div>

      {progSel ?
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">3. Download ZIP</h2>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {clienteSel?.nome} · {progSel.nome}
          </p>

          {loadingManifest ?
            <p className="mt-2 text-xs text-slate-500">Analisando faixas…</p>
          : manifest ?
            <>
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <li>
                  <span className="font-medium">{manifest.totalFaixas}</span> faixa(s) na grade ·{" "}
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">{manifest.baixaveis}</span>{" "}
                  com master 192k no B2
                  {manifest.omitidas > 0 ?
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-medium text-amber-700 dark:text-amber-300">
                        {manifest.omitidas} omitida(s)
                      </span>
                    </>
                  : null}
                </li>
                <li className="text-slate-500">
                  Pastas ({progSel.pastas.length}):{" "}
                  {progSel.pastas.map((p) => p.nome).join(", ") || "—"}
                </li>
                <li className="text-slate-500">
                  Estrutura no ZIP:{" "}
                  <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                    {manifest.clienteNome}/{manifest.programacaoNome}/POP/faixa.mp3
                  </code>
                </li>
                {zipPartCount > 1 ?
                  <li className="font-medium text-violet-700 dark:text-violet-300">
                    {zipPartCount} ZIPs automáticos (máx. {PLAYLIST_ZIP_TRACKS_PER_PART} faixas cada):{" "}
                    <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">…-zip1.zip</code>,{" "}
                    <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">…-zip2.zip</code>…
                  </li>
                : null}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={downloading || manifest.baixaveis === 0 || !masterOk}
                  onClick={() => void handleDownload()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {downloading ?
                    zipPartCount > 1 ?
                      "Baixando ZIPs…"
                    : "Baixando…"
                  : zipPartCount > 1 ?
                    `Baixar ${zipPartCount} ZIPs (192 kbps)`
                  : "Baixar ZIP (192 kbps)"}
                </button>
                {totalMusicasProg === 0 ?
                  <span className="text-xs text-slate-500">Programação vazia.</span>
                : null}
              </div>

              {progress && downloading ?
                <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {progress.phase === "zipping" ?
                      progress.partCount && progress.partCount > 1 ?
                        `Compactando ZIP ${progress.partIndex}/${progress.partCount}…`
                      : "Compactando ZIP…"
                    : progress.phase === "fetching" ?
                      progress.partCount && progress.partCount > 1 ?
                        `ZIP ${progress.partIndex}/${progress.partCount} · faixa ${progress.done + 1}/${progress.total}`
                      : `Baixando ${progress.done + 1}/${progress.total}…`
                    : ""}
                    {progress.currentLabel ?
                      <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500">
                        {progress.currentLabel}
                      </span>
                    : null}
                  </p>
                  {(progress.overallTotal ?? progress.total) > 0 ?
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (((progress.overallDone ?? progress.done) +
                                (progress.phase === "zipping" ? 0.5 : 0)) /
                                (progress.overallTotal ?? progress.total)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  : null}
                </div>
              : null}
            </>
          : null}

          {erro ?
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-300">{erro}</p>
          : null}
        </section>
      : null}
    </div>
  );
}
