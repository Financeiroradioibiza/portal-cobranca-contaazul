"use client";

import { useCallback, useEffect, useState } from "react";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { formatPastaMusicaAddedAt } from "@/lib/criacao/pastaMusicaUi";

type CriadorPasta = {
  id: string;
  nome: string;
  selecionavel: boolean;
  musicasCount: number;
};

type CriadorProg = {
  id: string;
  nome: string;
  publicada: boolean;
  atualizacaoAberta: boolean;
  pastas: CriadorPasta[];
};

type CriadorCliente = {
  ref: string;
  nome: string;
  progs: CriadorProg[];
};

type PastaMusicaSlim = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  mixSegundosFinais: number | null;
  previewUrl: string | null;
  addedAt: string | null;
  tagsManuais: { id: string; nome: string; cor: string; criativoNome: string }[];
};

function fmtDur(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function tagTextColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#0f172a";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0f172a" : "#f8fafc";
}

function MusicaSlimList({
  pastaId,
  pastaNome,
  onClose,
}: {
  pastaId: string;
  pastaNome: string;
  onClose: () => void;
}) {
  const [musicas, setMusicas] = useState<PastaMusicaSlim[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/criacao/pastas/${pastaId}/musicas`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { musicas?: PastaMusicaSlim[] };
      setMusicas(data.musicas ?? []);
    } catch {
      setMusicas([]);
    } finally {
      setLoading(false);
    }
  }, [pastaId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950">
      {/* Topo */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Fechar
        </button>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{pastaNome}</span>
        <span className="ml-auto text-xs text-slate-400">{musicas.length} faixa{musicas.length === 1 ? "" : "s"}</span>
      </div>

      {/* Lista slim */}
      <div className="flex-1 overflow-auto">
        {loading ?
          <div className="py-12 text-center text-sm text-slate-500">Carregando…</div>
        : musicas.length === 0 ?
          <div className="py-12 text-center text-sm text-slate-400">Pasta vazia.</div>
        : <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {musicas.map((m, idx) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
              >
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{idx + 1}</span>
                {m.previewUrl ?
                  <MusicaPreviewButton
                    track={{ id: m.id, titulo: m.titulo, artista: m.artista, previewUrl: m.previewUrl, durationMs: m.durationMs }}
                  />
                : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-300 dark:bg-slate-800">
                    🎵
                  </span>
                }
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-100">{m.titulo || "(sem título)"}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs text-slate-500">{m.artista || "—"}</span>
                    {m.tagsManuais.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className="rounded px-1 py-px text-[9px] font-bold"
                        style={{ backgroundColor: t.cor, color: tagTextColor(t.cor) }}
                        title={t.criativoNome ? `${t.criativoNome}: ${t.nome}` : t.nome}
                      >
                        {t.nome}
                      </span>
                    ))}
                  </div>
                </div>
                {m.mixSegundosFinais != null ?
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                    mix {m.mixSegundosFinais}s
                  </span>
                : null}
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400" title="Data de entrada na pasta">
                  {formatPastaMusicaAddedAt(m.addedAt)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">{fmtDur(m.durationMs)}</span>
              </li>
            ))}
          </ul>
        }
      </div>
    </div>
  );
}

export function CriadorPanel() {
  const [clientes, setClientes] = useState<CriadorCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProgs, setExpandedProgs] = useState<Set<string>>(new Set());
  const [pastaAberta, setPastaAberta] = useState<{ id: string; nome: string } | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/criacao/criador");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { clientes?: CriadorCliente[] };
      setClientes(data.clientes ?? []);
    } catch {
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleProg(id: string) {
    setExpandedProgs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const clientesFiltrados = busca.trim()
    ? clientes.filter(
        (c) =>
          c.nome.toLowerCase().includes(busca.toLowerCase()) ||
          c.progs.some((p) => p.nome.toLowerCase().includes(busca.toLowerCase())),
      )
    : clientes;

  const totalProgs = clientes.reduce((a, c) => a + c.progs.length, 0);
  const totalFaixas = clientes.reduce(
    (a, c) => a + c.progs.reduce((b, p) => b + p.pastas.reduce((s, f) => s + f.musicasCount, 0), 0),
    0,
  );

  return (
    <>
      {pastaAberta ?
        <MusicaSlimList
          pastaId={pastaAberta.id}
          pastaNome={pastaAberta.nome}
          onClose={() => setPastaAberta(null)}
        />
      : null}

      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-4">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Criação / CRIADOR</div>
            <h1 className="text-lg font-bold leading-tight">Minhas programações</h1>
            {!loading ?
              <p className="mt-0.5 text-xs text-slate-500">
                {clientesFiltrados.length} cliente{clientesFiltrados.length === 1 ? "" : "s"} · {totalProgs} programação{totalProgs === 1 ? "" : "ões"} · {totalFaixas} faixas
              </p>
            : null}
          </div>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou programação…"
            className="w-full max-w-[240px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </header>

        {loading ?
          <div className="py-12 text-center text-sm text-slate-500">Carregando suas programações…</div>
        : clientesFiltrados.length === 0 ?
          <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
            {busca ? "Nenhum resultado para essa busca." : "Você ainda não é dono de nenhuma programação."}
          </div>
        : <div className="space-y-2">
            {clientesFiltrados.map((cliente) => (
              <div
                key={cliente.ref}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Header do cliente */}
                <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/60">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] font-bold text-white dark:bg-slate-600">
                      {cliente.nome.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{cliente.nome}</span>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {cliente.progs.length} prog{cliente.progs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                {/* Programações */}
                <ul className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
                  {cliente.progs.map((prog) => {
                    const isOpen = expandedProgs.has(prog.id);
                    const totalFaixasProg = prog.pastas.reduce((a, p) => a + p.musicasCount, 0);
                    return (
                      <li key={prog.id}>
                        {/* Linha da programação */}
                        <button
                          type="button"
                          onClick={() => toggleProg(prog.id)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                        >
                          <span className="shrink-0 text-slate-400">{isOpen ? "▾" : "▸"}</span>
                          <span className="text-[10px]">🎼</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {prog.nome}
                          </span>
                          {prog.atualizacaoAberta ?
                            <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                              Aberta
                            </span>
                          : prog.publicada ?
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Encerrada
                            </span>
                          : <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800">
                              Rascunho
                            </span>
                          }
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {prog.pastas.length} pasta{prog.pastas.length === 1 ? "" : "s"} · {totalFaixasProg} faixa{totalFaixasProg === 1 ? "" : "s"}
                          </span>
                        </button>

                        {/* Pastas — visível apenas quando a prog está expandida */}
                        {isOpen ?
                          <ul className="border-t border-slate-100/60 dark:border-slate-800/40">
                            {prog.pastas.map((pasta) => (
                              <li key={pasta.id}>
                                <button
                                  type="button"
                                  onClick={() => setPastaAberta({ id: pasta.id, nome: `${prog.nome} / ${pasta.nome}` })}
                                  className="flex w-full items-center gap-2 py-1.5 pl-10 pr-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                >
                                  <span className="shrink-0 text-[10px] text-slate-400">
                                    {pasta.selecionavel ? "✋" : "📁"}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                                    {pasta.nome}
                                    {pasta.selecionavel ?
                                      <span className="ml-1 font-semibold text-violet-600 dark:text-violet-400">(sel)</span>
                                    : null}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-slate-400">
                                    {pasta.musicasCount} faixa{pasta.musicasCount === 1 ? "" : "s"}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-sky-500">ver →</span>
                                </button>
                              </li>
                            ))}
                            {prog.pastas.length === 0 ?
                              <li className="py-2 pl-10 text-xs text-slate-400">Nenhuma pasta.</li>
                            : null}
                          </ul>
                        : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        }
      </div>
    </>
  );
}
