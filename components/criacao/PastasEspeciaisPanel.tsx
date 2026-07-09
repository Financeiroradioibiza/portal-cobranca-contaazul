"use client";

import { useCallback, useEffect, useState } from "react";
import { AddMusicasBibliotecaModal } from "@/components/criacao/AddMusicasBibliotecaModal";
import type {
  PastaEspecialMusicaView,
  PastaEspecialView,
} from "@/lib/criacao/pastaEspecialService";

const VELOCIDADE_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export function PastasEspeciaisPanel() {
  const [pastas, setPastas] = useState<PastaEspecialView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [novaPasta, setNovaPasta] = useState("");
  const [novaSelecionavel, setNovaSelecionavel] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addTo, setAddTo] = useState<PastaEspecialView | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, PastaEspecialMusicaView[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/criacao/pastas-especiais");
      if (!res.ok) throw new Error("Falha ao carregar pastas especiais.");
      const data = (await res.json()) as { pastas?: PastaEspecialView[] };
      setPastas(data.pastas ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadDetail(pastaId: string) {
    const res = await fetch(`/api/criacao/pastas-especiais/${pastaId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { pasta?: PastaEspecialView };
    if (data.pasta?.musicas) {
      setDetailCache((prev) => ({ ...prev, [pastaId]: data.pasta!.musicas! }));
    }
  }

  async function createPasta() {
    const nome = novaPasta.trim();
    if (!nome) return;
    setNovaPasta("");
    const res = await fetch("/api/criacao/pastas-especiais", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, selecionavel: novaSelecionavel }),
    });
    if (!res.ok) {
      setErr("Não foi possível criar a pasta especial.");
      return;
    }
    setNovaSelecionavel(false);
    await load();
  }

  async function deletePasta(id: string, nome: string) {
    if (!confirm(`Excluir a pasta especial “${nome}” e todas as faixas dela?`)) return;
    await fetch(`/api/criacao/pastas-especiais/${id}`, { method: "DELETE" });
    setDetailCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await load();
  }

  async function patchPasta(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/criacao/pastas-especiais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
    if (expanded.has(id)) await loadDetail(id);
  }

  async function removeMusica(pastaId: string, musicaId: string) {
    await fetch(`/api/criacao/pastas-especiais/${pastaId}/musicas`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicaIds: [musicaId] }),
    });
    await loadDetail(pastaId);
    await load();
  }

  function toggleExpand(pastaId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pastaId)) next.delete(pastaId);
      else {
        next.add(pastaId);
        void loadDetail(pastaId);
      }
      return next;
    });
  }

  const musicasFor = (pasta: PastaEspecialView) =>
    detailCache[pasta.id] ?? pasta.musicas ?? [];

  return (
    <div className="mx-auto max-w-[900px] px-3 py-6 sm:px-4">
      <div className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Criação / Pastas Especiais
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Pastas Especiais</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Crie pastas-modelo com faixas da biblioteca. Use <strong>+ Especial</strong> ao editar uma
          programação para copiar uma pasta pronta para qualquer cliente.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={novaPasta}
          onChange={(e) => setNovaPasta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createPasta();
          }}
          placeholder="Nome da pasta especial (ex.: Instrumentais, Sucessos 80s…)"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <label className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
          <input
            type="checkbox"
            checked={novaSelecionavel}
            onChange={(e) => setNovaSelecionavel(e.target.checked)}
            className="h-4 w-4 rounded border-violet-300 text-violet-700 focus:ring-violet-500"
          />
          Selecionável no player
        </label>
        <button
          type="button"
          onClick={() => void createPasta()}
          className="rounded-lg bg-violet-900 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
        >
          + Pasta especial
        </button>
      </div>

      {err ?
        <p className="mb-3 text-sm text-red-600">{err}</p>
      : null}
      {loading ?
        <p className="text-sm text-slate-500">Carregando…</p>
      : pastas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Crie a primeira pasta especial e adicione faixas com + Músicas.
        </div>
      : <div className="space-y-3">
          {pastas.map((pasta) => {
            const isOpen = expanded.has(pasta.id);
            const musicas = musicasFor(pasta);
            return (
              <div
                key={pasta.id}
                className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm dark:border-violet-900 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-violet-50/80 px-4 py-2.5 dark:border-violet-900 dark:bg-violet-950/30">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(pasta.id)}
                      className="shrink-0 text-slate-400 hover:text-slate-700"
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                    <input
                      defaultValue={pasta.nome}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== pasta.nome) void patchPasta(pasta.id, { nome: v });
                      }}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-semibold outline-none focus:border-violet-300 focus:bg-white dark:focus:border-violet-700 dark:focus:bg-slate-950"
                    />
                    <span className="text-[11px] text-slate-500">
                      {pasta.musicaCount} faixa(s)
                      {pasta.selecionavel ? " · selecionável" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={pasta.velocidade}
                      onChange={(e) => void patchPasta(pasta.id, { velocidade: e.target.value })}
                      className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      {Object.entries(VELOCIDADE_LABEL).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={pasta.selecionavel}
                        onChange={(e) =>
                          void patchPasta(pasta.id, { selecionavel: e.target.checked })
                        }
                      />
                      Player
                    </label>
                    <button
                      type="button"
                      onClick={() => setAddTo(pasta)}
                      className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                    >
                      + Músicas
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePasta(pasta.id, pasta.nome)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
                {isOpen ?
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {musicas.length === 0 ?
                      <li className="px-4 py-6 text-center text-xs text-slate-400">
                        Nenhuma faixa — use + Músicas.
                      </li>
                    : musicas.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{m.titulo || "(sem título)"}</div>
                            <div className="truncate text-xs text-slate-500">{m.artista || "—"}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeMusica(pasta.id, m.id)}
                            className="shrink-0 text-xs text-red-600 hover:underline"
                          >
                            Remover
                          </button>
                        </li>
                      ))
                    }
                  </ul>
                : null}
              </div>
            );
          })}
        </div>
      }

      {addTo ?
        <AddMusicasBibliotecaModal
          title={`Adicionar à pasta especial “${addTo.nome}”`}
          subtitle="Mesma biblioteca usada nas programações — filtre por tag ou busque por nome."
          getDisabledReason={(id) => {
            const ja = musicasFor(addTo).some((m) => m.id === id);
            return ja ? "já na pasta" : null;
          }}
          onClose={() => setAddTo(null)}
          onConfirm={async (musicaIds) => {
            await fetch(`/api/criacao/pastas-especiais/${addTo.id}/musicas`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ musicaIds }),
            });
            setAddTo(null);
            await loadDetail(addTo.id);
            await load();
          }}
        />
      : null}
    </div>
  );
}
