"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FORMATO_LABEL } from "@/lib/criacao/programacaoService";

type Cliente = { ref: string; nome: string; pdvCount: number };

type ArvorePasta = { id: string; nome: string; velocidade: string; musicasCount: number };
type ArvoreVinheta = { id: string; nome: string; tipo: string };
type ArvoreProg = {
  id: string;
  nome: string;
  formatoPadrao: string;
  publicada: boolean;
  pastas: ArvorePasta[];
  vinhetas: ArvoreVinheta[];
};

const FORMATOS = ["mp3_128_mono", "mp3_128_stereo", "mp3_192_mono", "mp3_192_stereo"];
const VELOCIDADE_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

export function ProgramacoesAdminPanel({ onOpenEditor }: { onOpenEditor: (programacaoId: string) => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [arvore, setArvore] = useState<ArvoreProg[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [loadingArvore, setLoadingArvore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNovaProg, setShowNovaProg] = useState(false);

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
    try {
      const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(ref)}/arvore`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { arvore: ArvoreProg[] };
      setArvore(data.arvore);
      setExpanded(new Set(data.arvore.map((p) => p.id)));
    } catch {
      setArvore([]);
    } finally {
      setLoadingArvore(false);
    }
  }, []);

  useEffect(() => {
    if (clienteSel) void loadArvore(clienteSel.ref);
    else setArvore([]);
  }, [clienteSel, loadArvore]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes;
    return base.slice(0, 80);
  }, [clientes, clienteBusca]);

  const stats = useMemo(() => {
    const progs = arvore.length;
    const pastas = arvore.reduce((a, p) => a + p.pastas.length, 0);
    const vinhetas = arvore.reduce((a, p) => a + p.vinhetas.length, 0);
    const faixas = arvore.reduce((a, p) => a + p.pastas.reduce((b, f) => b + f.musicasCount, 0), 0);
    return { progs, pastas, vinhetas, faixas };
  }, [arvore]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function excluirProgramacao(id: string, nome: string) {
    if (!confirm(`Excluir programação “${nome}” e todas as pastas?`)) return;
    await fetch(`/api/criacao/programacoes/${id}`, { method: "DELETE" });
    if (clienteSel) await loadArvore(clienteSel.ref);
  }

  async function excluirPasta(id: string, nome: string) {
    if (!confirm(`Excluir pasta “${nome}”?`)) return;
    await fetch(`/api/criacao/pastas/${id}`, { method: "DELETE" });
    if (clienteSel) await loadArvore(clienteSel.ref);
  }

  async function excluirVinheta(id: string, nome: string) {
    if (!confirm(`Excluir vinheta “${nome}”?`)) return;
    await fetch(`/api/criacao/vinhetas/${id}`, { method: "DELETE" });
    if (clienteSel) await loadArvore(clienteSel.ref);
  }

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-6 sm:px-4">
      <div className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Criação / Programações
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Central de programações</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Organize por cliente da produção: programações musicais, pastas (playlists) e vinhetas.
          Depois de montar aqui, escolha a pasta no <strong>Upload</strong> para enviar faixas direto.
        </p>
      </div>

      <div className="grid min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
        {/* Coluna clientes — estilo Central de Suporte */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#faf8f5] shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 bg-[#f5f0e8] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/80">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Clientes produção
            </div>
            <input
              value={clienteBusca}
              onChange={(e) => setClienteBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {loadingClientes ?
              <li className="px-3 py-6 text-sm text-slate-500">Carregando…</li>
            : clientesFiltrados.length === 0 ?
              <li className="px-3 py-6 text-sm text-slate-500">Nenhum cliente.</li>
            : clientesFiltrados.map((c) => {
                const on = clienteSel?.ref === c.ref;
                return (
                  <li key={c.ref}>
                    <button
                      type="button"
                      onClick={() => setClienteSel(c)}
                      className={
                        "flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm transition dark:border-slate-800 " +
                        (on ?
                          "bg-amber-100/80 font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                        : "hover:bg-white/80 dark:hover:bg-slate-800/50")
                      }
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white dark:bg-slate-700">
                        {c.nome.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.nome}</span>
                        <span className="text-[10px] text-slate-500">{c.pdvCount} PDV</span>
                      </span>
                    </button>
                  </li>
                );
              })
            }
          </ul>
        </div>

        {/* Coluna hierarquia */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!clienteSel ?
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
              Selecione um cliente à esquerda para ver e organizar programações, pastas e vinhetas.
            </div>
          : <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f5f0e8] px-4 py-3 dark:border-slate-800 dark:bg-slate-800/80">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {clienteSel.nome}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-slate-600 dark:text-slate-400">
                    <span>{stats.progs} prog.</span>
                    <span>{stats.pastas} pastas</span>
                    <span>{stats.vinhetas} vinhetas</span>
                    <span>{stats.faixas} faixas</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNovaProg(true)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  + Nova programação
                </button>
              </div>

              {showNovaProg ?
                <NovaProgramacaoInline
                  cliente={clienteSel}
                  onClose={() => setShowNovaProg(false)}
                  onCreated={async () => {
                    setShowNovaProg(false);
                    await loadArvore(clienteSel.ref);
                  }}
                />
              : null}

              {loadingArvore ?
                <div className="p-8 text-sm text-slate-500">Carregando hierarquia…</div>
              : arvore.length === 0 ?
                <div className="p-8 text-center text-sm text-slate-500">
                  Nenhuma programação para este cliente. Crie a primeira acima.
                </div>
              : <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                  {arvore.map((prog) => (
                    <li key={prog.id} className="px-2 py-2">
                      <div className="flex items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <button
                          type="button"
                          onClick={() => toggleExpand(prog.id)}
                          className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-700"
                          aria-label={expanded.has(prog.id) ? "Recolher" : "Expandir"}
                        >
                          {expanded.has(prog.id) ? "▾" : "▸"}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base">🎼</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{prog.nome}</span>
                            {prog.publicada ?
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                Publicada
                              </span>
                            : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800">
                                Rascunho
                              </span>
                            }
                            <span className="text-[10px] text-slate-400">
                              {FORMATO_LABEL[prog.formatoPadrao as keyof typeof FORMATO_LABEL] ?? prog.formatoPadrao}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenEditor(prog.id)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                            >
                              Editor completo
                            </button>
                            <NovaPastaInline programacaoId={prog.id} onDone={() => loadArvore(clienteSel.ref)} />
                            <NovaVinhetaInline programacaoId={prog.id} onDone={() => loadArvore(clienteSel.ref)} />
                            <button
                              type="button"
                              onClick={() => void excluirProgramacao(prog.id, prog.nome)}
                              className="rounded px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              excluir
                            </button>
                          </div>
                        </div>
                      </div>

                      {expanded.has(prog.id) ?
                        <ul className="ms-6 mt-1 space-y-0.5 border-s border-slate-200 ps-3 dark:border-slate-700">
                          {prog.pastas.map((pasta) => (
                            <li key={pasta.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <span className="text-slate-400">📁</span>
                              <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                                {pasta.nome}
                              </span>
                              <span className="shrink-0 text-[10px] text-slate-400">
                                {VELOCIDADE_LABEL[pasta.velocidade] ?? pasta.velocidade}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                                {pasta.musicasCount} faixa{pasta.musicasCount === 1 ? "" : "s"}
                              </span>
                              <button
                                type="button"
                                onClick={() => void excluirPasta(pasta.id, pasta.nome)}
                                className="shrink-0 text-[10px] text-red-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                          {prog.vinhetas.map((v) => (
                            <li key={v.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <span className="text-slate-400">{v.tipo === "audio" ? "🔊" : "🗣"}</span>
                              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{v.nome}</span>
                              <span className="shrink-0 text-[10px] uppercase text-slate-400">{v.tipo}</span>
                              <button
                                type="button"
                                onClick={() => void excluirVinheta(v.id, v.nome)}
                                className="shrink-0 text-[10px] text-red-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                          {prog.pastas.length === 0 && prog.vinhetas.length === 0 ?
                            <li className="px-2 py-2 text-xs text-slate-400">Sem pastas nem vinhetas — crie acima.</li>
                          : null}
                        </ul>
                      : null}
                    </li>
                  ))}
                </ul>
              }
            </>
          }
        </div>
      </div>
    </div>
  );
}

function NovaProgramacaoInline({
  cliente,
  onClose,
  onCreated,
}: {
  cliente: Cliente;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [formato, setFormato] = useState("mp3_128_mono");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/criacao/programacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteRef: cliente.ref,
          clienteNome: cliente.nome,
          nome: nome.trim(),
          formatoPadrao: formato,
        }),
      });
      if (!res.ok) throw new Error();
      setNome("");
      await onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-slate-200 bg-amber-50/50 px-4 py-3 dark:border-slate-800 dark:bg-amber-950/20">
      <div className="mb-2 text-xs font-bold text-slate-600">Nova programação · {cliente.nome}</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[160px] flex-1 text-sm">
          <span className="mb-1 block text-[10px] font-semibold text-slate-500">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Padrão loja"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] font-semibold text-slate-500">Formato</span>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {FORMATOS.map((f) => (
              <option key={f} value={f}>
                {FORMATO_LABEL[f as keyof typeof FORMATO_LABEL]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          Criar
        </button>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">
          cancelar
        </button>
      </div>
    </div>
  );
}

function NovaPastaInline({ programacaoId, onDone }: { programacaoId: string; onDone: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/criacao/programacoes/${programacaoId}/pastas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      setNome("");
      setOpen(false);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600"
      >
        + pasta
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="Nome da pasta"
        className="w-28 rounded border border-slate-200 px-2 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
        autoFocus
      />
      <button type="button" disabled={busy} onClick={() => void submit()} className="text-[10px] font-bold text-emerald-600">
        ok
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-400">
        ✕
      </button>
    </span>
  );
}

function NovaVinhetaInline({ programacaoId, onDone }: { programacaoId: string; onDone: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), tipo: "tts" }),
      });
      setNome("");
      setOpen(false);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600"
      >
        + vinheta
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="Nome da vinheta"
        className="w-28 rounded border border-slate-200 px-2 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
        autoFocus
      />
      <button type="button" disabled={busy} onClick={() => void submit()} className="text-[10px] font-bold text-emerald-600">
        ok
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-400">
        ✕
      </button>
    </span>
  );
}
