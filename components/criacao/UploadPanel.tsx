"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CriativoTagSelect, formatTagChipPreview } from "@/components/criacao/CriativoTagSelect";

type Cliente = { ref: string; nome: string; pdvCount: number };
type ArvorePasta = { id: string; nome: string; velocidade: string; musicasCount: number };
type ArvoreProg = { id: string; nome: string; pastas: ArvorePasta[] };
type PickedFile = { nome: string; sizeBytes: number; file: File };
type Ticket = { itemId: string; arquivoNome: string; token: string; exp: number };

type Modo = "mp3" | "externo" | "biblioteca";

function formatBytes(b: number): string {
  if (!b) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export function UploadPanel() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("mp3");
  const [titulo, setTitulo] = useState("");
  const [uploadTag, setUploadTag] = useState("");
  const [tagCriativoUserId, setTagCriativoUserId] = useState("");
  const [tagCriativoIniciais, setTagCriativoIniciais] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [arvore, setArvore] = useState<ArvoreProg[]>([]);
  const [progSel, setProgSel] = useState("");
  const [pastaSel, setPastaSel] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!clienteSel) {
      setArvore([]);
      setProgSel("");
      setPastaSel("");
      return;
    }
    let cancelled = false;
    fetch(`/api/criacao/clientes/${encodeURIComponent(clienteSel.ref)}/arvore`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.arvore) setArvore(d.arvore as ArvoreProg[]);
      })
      .catch(() => {
        if (!cancelled) setArvore([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clienteSel]);

  const pastasDisponiveis = useMemo(() => {
    const prog = arvore.find((p) => p.id === progSel);
    return prog?.pastas ?? [];
  }, [arvore, progSel]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes;
    return base.slice(0, 40);
  }, [clientes, clienteBusca]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const next: PickedFile[] = [];
    for (const f of Array.from(list)) {
      if (!/\.mp3$/i.test(f.name) && !f.type.includes("audio")) continue;
      next.push({ nome: f.name, sizeBytes: f.size, file: f });
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.nome));
      return [...prev, ...next.filter((n) => !seen.has(n.nome))];
    });
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (files.length === 0) {
      setMsg("Selecione ao menos um arquivo MP3.");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    setProgress({ done: 0, total: files.length });
    try {
      // 1) cria o job + tickets HMAC (sem binários — payload minúsculo via Netlify)
      const res = await fetch("/api/criacao/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo || (clienteSel ? `Upload · ${clienteSel.nome}` : "Upload"),
          clienteRef: clienteSel?.ref,
          clienteNome: clienteSel?.nome,
          uploadTagNome: uploadTag.trim() || undefined,
          tagCriativoUserId: tagCriativoUserId || undefined,
          programacaoId: progSel || undefined,
          pastaId: pastaSel || undefined,
          arquivos: files.map((f) => ({ nome: f.nome, sizeBytes: f.sizeBytes })),
        }),
      });
      if (!res.ok) throw new Error("upload_failed");
      const data = (await res.json()) as { ingestUrl: string; tickets: Ticket[] };
      const ticketByNome = new Map(data.tickets.map((t) => [t.arquivoNome, t]));

      // 2) envia cada binário DIRETO pro cloud2 (não passa pelo Netlify)
      const falhas: string[] = [];
      let done = 0;
      for (const f of files) {
        const ticket = ticketByNome.get(f.nome.slice(0, 500));
        if (!ticket) {
          falhas.push(f.nome);
          continue;
        }
        const fd = new FormData();
        fd.append("token", ticket.token); // token ANTES do arquivo (o servidor valida em ordem)
        fd.append("file", f.file, f.nome);
        try {
          const up = await fetch(data.ingestUrl, { method: "POST", body: fd });
          if (!up.ok) falhas.push(f.nome);
        } catch {
          falhas.push(f.nome);
        }
        done += 1;
        setProgress({ done, total: files.length });
      }

      if (falhas.length > 0) {
        setMsg(
          `${files.length - falhas.length}/${files.length} enviados. Falharam: ${falhas
            .slice(0, 5)
            .join(", ")}${falhas.length > 5 ? "…" : ""}`,
        );
        setSubmitting(false);
        setProgress(null);
        return;
      }
      router.push("/criacao/fila");
    } catch {
      setMsg("Não foi possível criar o job de processamento.");
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Criação / Upload
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Upload de músicas</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Cada envio cria um job na <strong>Fila de processamento</strong> (dedupe, ponto de mix,
          normalização LUFS e tags). Os arquivos vão <strong>direto para o servidor de áudio</strong>{" "}
          (não passam pelo Netlify) e o worker do cloud2 processa em segundo plano.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ModoCard
          ativo={modo === "mp3"}
          onClick={() => setModo("mp3")}
          icon="🎧"
          titulo="Arrastar MP3 192k"
          desc="Solte arquivos MP3 192 kbps direto aqui."
        />
        <ModoCard
          ativo={modo === "externo"}
          onClick={() => setModo("externo")}
          icon="⬇️"
          titulo="Música baixada"
          desc="Baixe pelo seu computador (ytdl etc.) e suba os arquivos."
        />
        <ModoCard
          ativo={modo === "biblioteca"}
          onClick={() => setModo("biblioteca")}
          icon="📚"
          titulo="Da biblioteca"
          desc="Arrastar faixas já existentes (na tela de Programações)."
        />
      </div>

      {modo === "biblioteca" ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
          Adicionar músicas que já estão na biblioteca é feito dentro de uma{" "}
          <strong>Programação</strong> (arrastando da biblioteca para as pastas). Em construção.
        </div>
      : <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Título do envio (opcional)</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Reserva Day — junho"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <CriativoTagSelect
              value={tagCriativoUserId}
              onChange={setTagCriativoUserId}
              onSelected={(c) => setTagCriativoIniciais(c?.tagIniciais ?? "")}
            />
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Tag criativa (ex.: POP 90s)</span>
              <input
                value={uploadTag}
                onChange={(e) => setUploadTag(e.target.value)}
                placeholder={
                  uploadTag.trim()
                    ? formatTagChipPreview(tagCriativoIniciais, uploadTag)
                    : `Ex.: ${formatTagChipPreview(tagCriativoIniciais, "POP 90s")}`
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <div className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Cliente (opcional)</span>
              {clienteSel ?
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <span className="truncate text-sm font-medium">{clienteSel.nome}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setClienteSel(null);
                      setProgSel("");
                      setPastaSel("");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    trocar
                  </button>
                </div>
              : <>
                  <input
                    value={clienteBusca}
                    onChange={(e) => setClienteBusca(e.target.value)}
                    placeholder={clientes.length ? "Buscar cliente da produção…" : "Carregando clientes…"}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  {clienteBusca.trim() && clientesFiltrados.length > 0 ?
                    <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      {clientesFiltrados.map((c) => (
                        <button
                          type="button"
                          key={c.ref}
                          onClick={() => {
                            setClienteSel(c);
                            setClienteBusca("");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span className="truncate">{c.nome}</span>
                          <span className="ml-2 shrink-0 text-xs text-slate-400">{c.pdvCount} PDV</span>
                        </button>
                      ))}
                    </div>
                  : null}
                </>
              }
            </div>
            {clienteSel ?
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Programação destino</span>
                <select
                  value={progSel}
                  onChange={(e) => {
                    setProgSel(e.target.value);
                    setPastaSel("");
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">— nenhuma —</option>
                  {arvore.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
            : null}
            {clienteSel && progSel ?
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Pasta destino (após processar)</span>
                <select
                  value={pastaSel}
                  onChange={(e) => setPastaSel(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">— só biblioteca —</option>
                  {pastasDisponiveis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.musicasCount} faixas)
                    </option>
                  ))}
                </select>
                {pastasDisponiveis.length === 0 ?
                  <p className="mt-1 text-[10px] text-amber-600">
                    Crie pastas em Criação → Programações antes de enviar aqui.
                  </p>
                : null}
              </label>
            : null}
          </div>

          {modo === "externo" ?
            <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              Apps como ytdl não baixam direto do servidor — baixe no seu computador e arraste os
              arquivos aqui em seguida.
            </div>
          : null}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-12 text-center transition " +
              (dragOver
                ? "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800"
                : "border-slate-300 hover:border-slate-400 dark:border-slate-700")
            }
          >
            <div className="text-3xl">🎵</div>
            <div className="mt-2 text-sm font-semibold">Arraste os MP3 aqui ou clique para escolher</div>
            <div className="mt-1 text-xs text-slate-500">MP3 192 kbps recomendado</div>
            <input
              ref={inputRef}
              type="file"
              accept="audio/mpeg,.mp3"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {files.length > 0 ?
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800">
                <span>{files.length} arquivo{files.length === 1 ? "" : "s"}</span>
                <button type="button" onClick={() => setFiles([])} className="text-slate-400 hover:text-red-600">
                  limpar
                </button>
              </div>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                {files.map((f) => (
                  <li key={f.nome} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="truncate">{f.nome}</span>
                    <span className="ml-3 flex shrink-0 items-center gap-3">
                      <span className="text-xs text-slate-400">{formatBytes(f.sizeBytes)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((x) => x.nome !== f.nome))}
                        className="text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          : null}

          {msg ? <div className="mt-3 text-sm text-red-600">{msg}</div> : null}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || files.length === 0}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {submitting
                ? progress
                  ? `Enviando ${progress.done}/${progress.total}…`
                  : "Enviando…"
                : "Enviar para a fila"}
            </button>
            <span className="text-xs text-slate-400">{files.length} para processar</span>
          </div>
        </>
      }
    </div>
  );
}

function ModoCard({
  ativo,
  onClick,
  icon,
  titulo,
  desc,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: string;
  titulo: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border p-4 text-left transition " +
        (ativo
          ? "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800")
      }
    >
      <div className="text-xl">{icon}</div>
      <div className="mt-1 text-sm font-semibold">{titulo}</div>
      <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
    </button>
  );
}
