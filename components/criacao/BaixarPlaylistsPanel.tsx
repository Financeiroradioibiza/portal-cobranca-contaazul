"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlaylistDownloadManifest } from "@/lib/criacao/playlistDownloadService";
import {
  downloadPlaylistAsZip,
  type PlaylistZipProgress,
} from "@/lib/criacao/playlistZipClient";

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
  const [b2Configured, setB2Configured] = useState(true);
  const [downloadMode, setDownloadMode] = useState<"portal_b2" | "unavailable" | null>(null);
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
        b2Configured?: boolean;
        downloadMode?: "portal_b2" | "unavailable";
        error?: string;
      };
      if (!res.ok || !data.manifest) {
        setErro(data.error === "not_found" ? "Programação não encontrada." : "Falha ao carregar.");
        return;
      }
      setDownloadMode(data.downloadMode ?? (data.b2Configured !== false ? "portal_b2" : "unavailable"));
      setB2Configured(data.b2Configured !== false);
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

  async function handleDownload() {
    if (!manifest || downloading) return;
    if (manifest.baixaveis === 0) {
      alert("Nenhuma faixa com master 192 kbps no B2 nesta programação.");
      return;
    }
    if (
      manifest.omitidas > 0 &&
      !window.confirm(
        `${manifest.omitidas} faixa(s) sem master no B2 serão omitidas. Continuar com ${manifest.baixaveis} faixa(s)?`,
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
        if (status === "503") {
          setErro(
            "B2 não configurado no Netlify — adicione B2_S3_ENDPOINT, B2_REGION, B2_BUCKET, B2_KEY_ID e B2_APPLICATION_KEY (mesmas do cloud2).",
          );
        } else if (status === "404") {
          setErro(`Master 192k ausente no B2: «${titulo}».`);
        } else if (status === "403") {
          setErro(
            `B2 recusou o download (403) — confira B2_KEY_ID e B2_APPLICATION_KEY no Netlify (sem aspas extras).`,
          );
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
          ) em master <strong>192 kbps</strong> (Backblaze B2 via portal).
        </p>
      </header>

      {downloadMode === "unavailable" || !masterOk || !b2Configured ?
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Baixar Playlists precisa das credenciais B2 no Netlify</strong> (mesmas do cloud2). No painel
          Netlify → Site configuration → Environment variables, adicione:
          <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-[11px]">
            <li>B2_S3_ENDPOINT</li>
            <li>B2_REGION</li>
            <li>B2_BUCKET</li>
            <li>B2_KEY_ID</li>
            <li>B2_APPLICATION_KEY</li>
            <li>B2_MASTER_PREFIX=master/</li>
          </ul>
          <p className="mt-2 font-sans">
            Valores: copie do <code>.env</code> do cloud2 (api/worker) ou de{" "}
            <code>.cloud2-secrets/b2.env</code>. Depois faça redeploy do site no Netlify.
          </p>
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
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={downloading || manifest.baixaveis === 0 || !masterOk}
                  onClick={() => void handleDownload()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {downloading ? "Baixando…" : "Baixar ZIP (192 kbps)"}
                </button>
                {totalMusicasProg === 0 ?
                  <span className="text-xs text-slate-500">Programação vazia.</span>
                : null}
              </div>

              {progress && downloading ?
                <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {progress.phase === "zipping" ?
                      "Compactando ZIP…"
                    : progress.phase === "fetching" ?
                      `Baixando ${progress.done + 1}/${progress.total}…`
                    : ""}
                    {progress.currentLabel ?
                      <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500">
                        {progress.currentLabel}
                      </span>
                    : null}
                  </p>
                  {progress.total > 0 ?
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{
                          width: `${Math.min(100, Math.round(((progress.done + (progress.phase === "zipping" ? 0.5 : 0)) / progress.total) * 100))}%`,
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
