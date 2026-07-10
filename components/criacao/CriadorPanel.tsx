"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CronogramaAlvoBadges } from "@/components/criacao/CronogramaAlvoBadges";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { MusicaVotosModal } from "@/components/criacao/MusicaVotosModal";
import type { AgendamentoRow } from "@/lib/criacao/agendamentoService";
import { marcarAtualizacaoAberta } from "@/lib/criacao/marcarAtualizacaoAbertaClient";
import { formatPastaMusicaAddedAt } from "@/lib/criacao/pastaMusicaUi";
import {
  OFF_PERCENT_OPTIONS,
  pickOldestMusicaIdsForOffPercent,
  type OffPercent,
} from "@/lib/criacao/pastaOffSelect";

type SortKey = "titulo" | "artista" | "addedAt";

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
  agendamentos: AgendamentoRow[];
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
  likesCount: number;
  dislikesCount: number;
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

function sortMusicas(list: PastaMusicaSlim[], key: SortKey | null): PastaMusicaSlim[] {
  if (!key) return list;
  return [...list].sort((a, b) => {
    if (key === "titulo") return (a.titulo || "").localeCompare(b.titulo || "", "pt-BR");
    if (key === "artista") return (a.artista || "").localeCompare(b.artista || "", "pt-BR");
    if (key === "addedAt") return (a.addedAt ?? "").localeCompare(b.addedAt ?? "");
    return 0;
  });
}

const OPEN_PROG_KEY = "criacao-open-prog";
const pastasAbertasKey = (progId: string) => `criacao-pastas-abertas:${progId}`;

async function fetchPastaMusicas(pastaId: string, programacaoId: string): Promise<PastaMusicaSlim[]> {
  const qs = `?programacaoId=${encodeURIComponent(programacaoId)}`;
  const res = await fetch(`/api/criacao/pastas/${pastaId}/musicas${qs}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { musicas?: PastaMusicaSlim[] };
  return data.musicas ?? [];
}

function PastaMusicasInline({
  pastaId,
  programacaoId,
  sortKey,
  selectedIds,
}: {
  pastaId: string;
  programacaoId: string;
  sortKey: SortKey | null;
  selectedIds?: Set<string>;
}) {
  const [musicas, setMusicas] = useState<PastaMusicaSlim[]>([]);
  const [loading, setLoading] = useState(true);
  const [votosModal, setVotosModal] = useState<{ id: string; titulo: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = programacaoId ? `?programacaoId=${encodeURIComponent(programacaoId)}` : "";
      const res = await fetch(`/api/criacao/pastas/${pastaId}/musicas${qs}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { musicas?: PastaMusicaSlim[] };
      setMusicas(data.musicas ?? []);
    } catch {
      setMusicas([]);
    } finally {
      setLoading(false);
    }
  }, [pastaId, programacaoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => sortMusicas(musicas, sortKey), [musicas, sortKey]);

  if (loading) {
    return <div className="py-3 pl-14 text-xs text-slate-500">Carregando músicas…</div>;
  }
  if (sorted.length === 0) {
    return <div className="py-3 pl-14 text-xs text-slate-400">Pasta vazia.</div>;
  }

  return (
    <>
    <ul className="divide-y divide-slate-100 bg-slate-50/40 dark:divide-slate-800/60 dark:bg-slate-950/30">
      {sorted.map((m, idx) => {
        const isSelected = selectedIds?.has(m.id) ?? false;
        return (
        <li
          key={m.id}
          className={
            "flex items-center gap-3 py-1.5 pl-14 pr-4 text-sm " +
            (isSelected ?
              "bg-orange-50/90 ring-1 ring-inset ring-orange-200 dark:bg-orange-950/30 dark:ring-orange-900"
            : "hover:bg-slate-50/80 dark:hover:bg-slate-800/30")
          }
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
          {(m.likesCount > 0 || m.dislikesCount > 0) ?
            <span className="inline-flex shrink-0 items-center gap-1">
              {m.likesCount > 0 ?
                <button
                  type="button"
                  onClick={() => setVotosModal({ id: m.id, titulo: m.titulo || "(sem título)" })}
                  className="rounded px-1 py-0.5 text-xs hover:bg-emerald-100 dark:hover:bg-emerald-950"
                  title={`${m.likesCount} like(s) nesta programação`}
                >
                  👍
                </button>
              : null}
              {m.dislikesCount > 0 ?
                <button
                  type="button"
                  onClick={() => setVotosModal({ id: m.id, titulo: m.titulo || "(sem título)" })}
                  className="rounded px-1 py-0.5 text-xs hover:bg-red-100 dark:hover:bg-red-950"
                  title={`${m.dislikesCount} dislike(s) nesta programação`}
                >
                  👎
                </button>
              : null}
            </span>
          : null}
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400" title="Data de entrada na pasta">
            {formatPastaMusicaAddedAt(m.addedAt)}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-slate-400">{fmtDur(m.durationMs)}</span>
        </li>
        );
      })}
    </ul>
    <MusicaVotosModal
      musicaId={votosModal?.id ?? null}
      titulo={votosModal?.titulo ?? ""}
      programacaoId={programacaoId}
      onClose={() => setVotosModal(null)}
    />
    </>
  );
}

export function CriadorPanel() {
  const router = useRouter();
  const [clientes, setClientes] = useState<CriadorCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProgs, setExpandedProgs] = useState<Set<string>>(new Set());
  const [expandedPastas, setExpandedPastas] = useState<Set<string>>(new Set());
  const [sortByPasta, setSortByPasta] = useState<Record<string, SortKey>>({});
  const [busca, setBusca] = useState("");
  const [selectedByPasta, setSelectedByPasta] = useState<Record<string, Set<string>>>({});
  const [offPercentByPasta, setOffPercentByPasta] = useState<Record<string, OffPercent>>({});
  const [offMenuPastaId, setOffMenuPastaId] = useState<string | null>(null);
  const [offApplying, setOffApplying] = useState<string | null>(null);
  const [offRemoving, setOffRemoving] = useState<string | null>(null);
  const [offMsg, setOffMsg] = useState<string | null>(null);

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

  function togglePasta(id: string) {
    setExpandedPastas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const applyOffPercent = useCallback(
    async (pasta: CriadorPasta, prog: CriadorProg, percent: OffPercent) => {
      if (pasta.musicasCount === 0) return;
      setOffApplying(pasta.id);
      setOffMsg(null);
      setOffMenuPastaId(null);
      try {
        const musicas = await fetchPastaMusicas(pasta.id, prog.id);
        const ids = pickOldestMusicaIdsForOffPercent(musicas, percent);
        if (ids.length === 0) {
          setOffMsg("Nenhuma faixa para selecionar nesta pasta.");
          return;
        }
        setSelectedByPasta((prev) => ({ ...prev, [pasta.id]: new Set(ids) }));
        setOffPercentByPasta((prev) => ({ ...prev, [pasta.id]: percent }));
        setExpandedProgs((prev) => new Set(prev).add(prog.id));
        setExpandedPastas((prev) => new Set(prev).add(pasta.id));
        setSortByPasta((prev) => ({ ...prev, [pasta.id]: "addedAt" }));
      } catch {
        setOffMsg("Falha ao carregar faixas da pasta.");
      } finally {
        setOffApplying(null);
      }
    },
    [],
  );

  const clearOffSelection = useCallback((pastaId: string) => {
    setSelectedByPasta((prev) => {
      const next = { ...prev };
      delete next[pastaId];
      return next;
    });
    setOffPercentByPasta((prev) => {
      const next = { ...prev };
      delete next[pastaId];
      return next;
    });
  }, []);

  const removeOffSelection = useCallback(
    async (pasta: CriadorPasta, prog: CriadorProg) => {
      const ids = [...(selectedByPasta[pasta.id] ?? [])];
      if (ids.length === 0) return;
      const pct = offPercentByPasta[pasta.id];
      const pctLabel = pct ? ` (${pct}% OFF — mais antigas)` : "";
      if (
        !window.confirm(
          `Retirar ${ids.length} faixa${ids.length === 1 ? "" : "s"} da pasta «${pasta.nome}»${pctLabel}?\n\nA programação será aberta na central de programações.`,
        )
      ) {
        return;
      }
      setOffRemoving(pasta.id);
      setOffMsg(null);
      try {
        await marcarAtualizacaoAberta(prog.id);
        const res = await fetch(`/api/criacao/pastas/${pasta.id}/musicas`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ musicaIds: ids }),
        });
        if (!res.ok) throw new Error("delete_failed");
        sessionStorage.setItem(OPEN_PROG_KEY, prog.id);
        sessionStorage.setItem(pastasAbertasKey(prog.id), JSON.stringify([pasta.id]));
        router.push("/criacao/programacoes");
      } catch {
        setOffMsg("Não foi possível remover as faixas selecionadas.");
        setOffRemoving(null);
      }
    },
    [selectedByPasta, offPercentByPasta, router],
  );

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

      {offMsg ?
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {offMsg}
        </div>
      : null}

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

              <ul className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
                {cliente.progs.map((prog) => {
                  const isOpen = expandedProgs.has(prog.id);
                  const totalFaixasProg = prog.pastas.reduce((a, p) => a + p.musicasCount, 0);
                  return (
                    <li key={prog.id}>
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
                            Atualizada
                          </span>
                        : <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800">
                            Rascunho
                          </span>
                        }
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {prog.pastas.length} pasta{prog.pastas.length === 1 ? "" : "s"} · {totalFaixasProg} faixa{totalFaixasProg === 1 ? "" : "s"}
                        </span>
                      </button>

                      {isOpen ?
                        <ul className="border-t border-slate-100/60 dark:border-slate-800/40">
                          {prog.pastas.map((pasta) => {
                            const pastaOpen = expandedPastas.has(pasta.id);
                            const currentSort = sortByPasta[pasta.id] ?? null;
                            const selected = selectedByPasta[pasta.id] ?? new Set<string>();
                            const selectedCount = selected.size;
                            const offPct = offPercentByPasta[pasta.id];
                            return (
                              <li key={pasta.id} className="border-b border-slate-100/40 last:border-b-0 dark:border-slate-800/30">
                                <div className="flex flex-wrap items-center gap-2 py-1.5 pl-8 pr-4">
                                  <button
                                    type="button"
                                    onClick={() => togglePasta(pasta.id)}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80"
                                  >
                                    <span className="shrink-0 text-slate-400">{pastaOpen ? "▾" : "▸"}</span>
                                    <span className="shrink-0 text-[10px] text-slate-400">
                                      {pasta.selecionavel ? "✋" : "📁"}
                                    </span>
                                    <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                                      {pasta.nome}
                                      {pasta.selecionavel ?
                                        <span className="ml-1 font-semibold text-violet-600 dark:text-violet-400">(sel)</span>
                                      : null}
                                    </span>
                                  </button>
                                  <CronogramaAlvoBadges ags={prog.agendamentos} alvoTipo="pasta" alvoId={pasta.id} />
                                  <span className="shrink-0 text-[10px] text-slate-400">
                                    {pasta.musicasCount} faixa{pasta.musicasCount === 1 ? "" : "s"}
                                    {selectedCount > 0 ?
                                      <span className="ml-1 font-semibold text-orange-600 dark:text-orange-400">
                                        · {selectedCount} OFF{offPct ? ` (${offPct}%)` : ""}
                                      </span>
                                    : null}
                                  </span>
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      disabled={pasta.musicasCount === 0 || offApplying === pasta.id || offRemoving === pasta.id}
                                      onClick={() =>
                                        setOffMenuPastaId((prev) => (prev === pasta.id ? null : pasta.id))
                                      }
                                      className="rounded border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-40 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200 dark:hover:bg-orange-900"
                                      title="Selecionar faixas mais antigas para retirar (OFF)"
                                    >
                                      {offApplying === pasta.id ? "…" : "OFF"}
                                    </button>
                                    {offMenuPastaId === pasta.id ?
                                      <div className="absolute right-0 top-full z-20 mt-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                        {OFF_PERCENT_OPTIONS.map((pct) => (
                                          <button
                                            key={pct}
                                            type="button"
                                            onClick={() => void applyOffPercent(pasta, prog, pct)}
                                            className="rounded px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-orange-100 dark:text-slate-200 dark:hover:bg-orange-950"
                                          >
                                            {pct}%
                                          </button>
                                        ))}
                                      </div>
                                    : null}
                                  </div>
                                  {selectedCount > 0 ?
                                    <>
                                      <button
                                        type="button"
                                        disabled={offRemoving === pasta.id}
                                        onClick={() => void removeOffSelection(pasta, prog)}
                                        className="shrink-0 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                                      >
                                        {offRemoving === pasta.id ? "Removendo…" : `Retirar (${selectedCount})`}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => clearOffSelection(pasta.id)}
                                        className="shrink-0 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                      >
                                        Limpar
                                      </button>
                                    </>
                                  : null}
                                  {pastaOpen ?
                                    <select
                                      value={currentSort ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value as SortKey | "";
                                        setSortByPasta((prev) => {
                                          const next = { ...prev };
                                          if (v) next[pasta.id] = v;
                                          else delete next[pasta.id];
                                          return next;
                                        });
                                      }}
                                      className="rounded border border-slate-200 px-2 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                                      title="Ordenar músicas"
                                    >
                                      <option value="">Ordem padrão</option>
                                      <option value="titulo">Por música</option>
                                      <option value="artista">Por artista</option>
                                      <option value="addedAt">Por data de entrada</option>
                                    </select>
                                  : null}
                                </div>
                                {pastaOpen ?
                                  <PastaMusicasInline
                                    pastaId={pasta.id}
                                    programacaoId={prog.id}
                                    sortKey={currentSort}
                                    selectedIds={selectedCount > 0 ? selected : undefined}
                                  />
                                : null}
                              </li>
                            );
                          })}
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
  );
}
