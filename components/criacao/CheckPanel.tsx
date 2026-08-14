"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CompareTrack } from "@/components/criacao/waveform/CompareTrack";
import {
  CriacaoClienteNomeComTag,
  criacaoClienteRowClass,
  type CriacaoClienteRow,
} from "@/components/criacao/CriacaoClienteTag";
import type { CheckResultRow } from "@/lib/criacao/checkService";
import { verdictClass, verdictLabel } from "@/lib/criacao/checkLabels";

type Cliente = CriacaoClienteRow & { pdvCount: number };
type ArvorePasta = { id: string; nome: string; musicasCount: number };
type ArvoreProg = { id: string; nome: string; pastas: ArvorePasta[] };

function formatBytes(b: number): string {
  if (!b) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function formatMs(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

async function uploadCheckFile(
  sessionId: string,
  file: File,
): Promise<{ fileId: string; arquivoNome: string }> {
  const fileId = crypto.randomUUID();
  const ticketRes = await fetch("/api/criacao/check/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, fileId }),
  });
  const ticketData = await ticketRes.json().catch(() => null);
  if (!ticketRes.ok || !ticketData?.ingestUrl || !ticketData?.token) {
    throw new Error(ticketData?.error || "ticket_falhou");
  }

  const form = new FormData();
  form.set("token", ticketData.token);
  form.set("file", file, file.name);

  const up = await fetch(ticketData.ingestUrl, { method: "POST", body: form });
  const upData = await up.json().catch(() => null);
  if (!up.ok || !upData?.ok) {
    throw new Error(upData?.error || "upload_falhou");
  }
  return { fileId, arquivoNome: file.name };
}

export function CheckPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [clienteBusca, setClienteBusca] = useState("");
  const [arvore, setArvore] = useState<ArvoreProg[]>([]);
  const [progSel, setProgSel] = useState("");
  const [pastaSel, setPastaSel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResultRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | null>(null);

  const cleanupSession = useCallback((id: string | null) => {
    if (!id) return;
    void fetch(`/api/criacao/check/session?sessionId=${encodeURIComponent(id)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/criacao/clientes")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.clientes)) setClientes(d.clientes);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!clienteSel?.ref) {
      setArvore([]);
      setProgSel("");
      setPastaSel("");
      return;
    }
    void fetch(`/api/criacao/clientes/${encodeURIComponent(clienteSel.ref)}/arvore`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.programacoes)) setArvore(d.programacoes);
        else setArvore([]);
      })
      .catch(() => setArvore([]));
    setProgSel("");
    setPastaSel("");
  }, [clienteSel?.ref]);

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const onUnload = () => cleanupSession(sessionRef.current);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      cleanupSession(sessionRef.current);
    };
  }, [cleanupSession]);

  const clientesFiltrados = clientes.filter((c) => {
    const q = clienteBusca.trim().toLowerCase();
    if (!q) return true;
    return c.nome.toLowerCase().includes(q) || String(c.ref).includes(q);
  });

  const prog = arvore.find((p) => p.id === progSel);
  const pasta = prog?.pastas.find((p) => p.id === pastaSel);

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const mp3s = [...list].filter((f) => /\.mp3$/i.test(f.name));
    if (!mp3s.length) {
      setMsg("Selecione arquivos .mp3");
      return;
    }
    setFiles(mp3s);
    setResults(null);
    setMsg(null);
  };

  const runCheck = async () => {
    if (!pastaSel || !files.length) {
      setMsg("Escolha cliente, programação, pasta e arquivos MP3.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setResults(null);
    setProgress(null);

    let sid = sessionId;
    try {
      if (sid) cleanupSession(sid);
      const sessRes = await fetch("/api/criacao/check/session", { method: "POST" });
      const sessData = await sessRes.json().catch(() => null);
      if (!sessRes.ok || !sessData?.sessionId) {
        throw new Error(sessData?.error || "sessao_falhou");
      }
      sid = sessData.sessionId as string;
      setSessionId(sid);

      setProgress({ done: 0, total: files.length });
      for (let i = 0; i < files.length; i += 1) {
        await uploadCheckFile(sid, files[i]!);
        setProgress({ done: i + 1, total: files.length });
      }

      const analyzeRes = await fetch("/api/criacao/check/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, pastaId: pastaSel }),
      });
      const analyzeData = await analyzeRes.json().catch(() => null);
      if (!analyzeRes.ok || !Array.isArray(analyzeData?.results)) {
        throw new Error(analyzeData?.error || "analyze_falhou");
      }
      setResults(analyzeData.results as CheckResultRow[]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "check_falhou");
      if (sid) cleanupSession(sid);
      setSessionId(null);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const resetAll = () => {
    cleanupSession(sessionId);
    setSessionId(null);
    setFiles([]);
    setResults(null);
    setExpanded(null);
    setMsg(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">CHECK</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Compare uma pasta de MP3s com as faixas já publicadas na programação — somente leitura.
          Os arquivos ficam em scratch temporário no cloud2 e são apagados ao sair desta página.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold">1 · Destino (somente leitura)</h2>
          <input
            type="search"
            placeholder="Buscar cliente…"
            value={clienteBusca}
            onChange={(e) => setClienteBusca(e.target.value)}
            className="mb-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="max-h-40 overflow-y-auto rounded-lg border dark:border-slate-700">
            {clientesFiltrados.map((c) => (
              <button
                key={c.ref}
                type="button"
                onClick={() => setClienteSel(c)}
                className={
                  "block w-full border-b px-3 py-2 text-left text-sm last:border-0 " +
                  criacaoClienteRowClass(c.tagCobranca, clienteSel?.ref === c.ref)
                }
              >
                <CriacaoClienteNomeComTag nome={c.nome} tagCobranca={c.tagCobranca} />
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            <select
              value={progSel}
              onChange={(e) => {
                setProgSel(e.target.value);
                setPastaSel("");
              }}
              disabled={!clienteSel || !arvore.length}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Programação…</option>
              {arvore.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <select
              value={pastaSel}
              onChange={(e) => setPastaSel(e.target.value)}
              disabled={!progSel}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Pasta…</option>
              {prog?.pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.musicasCount} faixas)
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold">2 · Pasta local para checar</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,audio/mpeg"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-950"
          >
            Clique para escolher MP3s (múltiplos)
          </button>
          {files.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {files.length} arquivo(s) · {formatBytes(files.reduce((a, f) => a + f.size, 0))}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !pastaSel || files.length === 0}
              onClick={() => void runCheck()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Checando…" : "Rodar CHECK"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetAll}
              className="rounded-lg border px-4 py-2 text-sm dark:border-slate-600"
            >
              Limpar
            </button>
          </div>
          {progress && (
            <p className="mt-2 text-xs text-slate-500">
              Upload {progress.done}/{progress.total}…
            </p>
          )}
          {msg && <p className="mt-2 text-sm text-rose-600">{msg}</p>}
        </section>
      </div>

      {pasta && (
        <p className="text-xs text-slate-500">
          Comparando com: <strong>{clienteSel?.nome}</strong> · {prog?.nome} / {pasta.nome}
        </p>
      )}

      {results && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Resultado ({results.length})</h2>
          {results.map((row) => (
            <article
              key={row.fileId}
              className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setExpanded(expanded === row.fileId ? null : row.fileId)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
              >
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdictClass(row.verdict)}`}>
                  {verdictLabel(row.verdict)} · {row.matchScore}%
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{row.arquivoNome}</div>
                  <div className="truncate text-xs text-slate-500">
                    Upload: {row.uploadArtista || "—"} — {row.uploadTitulo || "—"} · {formatMs(row.durationMs)}
                  </div>
                  {row.sistema && (
                    <div className="truncate text-xs text-slate-500">
                      Pasta: {row.sistema.artista} — {row.sistema.titulo} · {formatMs(row.sistema.durationMs)}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-400">{expanded === row.fileId ? "▲" : "▼"}</span>
              </button>

              {expanded === row.fileId && (
                <div className="border-t px-4 py-4 dark:border-slate-800">
                  <ul className="mb-4 space-y-1 text-xs">
                    {row.checks.map((c) => (
                      <li key={c.id} className={c.ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"}>
                        {c.ok ? "✓" : "○"} <strong>{c.label}:</strong> {c.detail}
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-3 md:grid-cols-2">
                    <CompareTrack
                      label="Seu upload"
                      subtitle={`${row.uploadTitulo}${row.uploadArtista ? ` — ${row.uploadArtista}` : ""}`}
                      previewUrl={row.uploadPreviewUrl}
                      accentClass="border-sky-200 bg-sky-50/80 dark:border-sky-900 dark:bg-sky-950/30"
                    />
                    <CompareTrack
                      label="Na pasta do cliente"
                      subtitle={
                        row.sistema
                          ? `${row.sistema.titulo} — ${row.sistema.artista}`
                          : "Nenhum par encontrado"
                      }
                      previewUrl={row.sistema?.previewUrl ?? null}
                      accentClass="border-violet-200 bg-violet-50/80 dark:border-violet-900 dark:bg-violet-950/30"
                    />
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
