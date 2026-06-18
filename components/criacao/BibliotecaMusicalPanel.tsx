"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TAG_SOURCE_LABEL } from "@/lib/criacao/bibliotecaService";

type AutoTag = { fonte: string; chave?: string; valor: string };
type ManualTag = { id: string; nome: string; cor: string };
type Musica = {
  id: string;
  titulo: string;
  artista: string;
  ano: number | null;
  durationMs: number | null;
  isrc: string | null;
  bpm: number | null;
  tom: string | null;
  energia: number | null;
  gravadora: string;
  status: string;
  mixSegundosFinais: number | null;
  tagsManuais: ManualTag[];
  tagsAuto: AutoTag[];
  previewUrl: string | null;
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Texto preto ou branco conforme a luminância da cor de fundo do chip. */
function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1e293b" : "#ffffff";
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  processando: "Processando",
  revisao_duplicata: "Revisão duplicata",
  pronta: "Pronta",
  erro: "Erro",
};

export function BibliotecaMusicalPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [musicas, setMusicas] = useState<Musica[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = useCallback(
    (m: Musica) => {
      const audio = audioRef.current;
      if (!audio || !m.previewUrl) return;
      setAudioError(null);
      if (playingId === m.id) {
        audio.pause();
        return;
      }
      audio.src = m.previewUrl;
      audio.play().then(
        () => setPlayingId(m.id),
        () => {
          setAudioError("Não foi possível tocar esta faixa.");
          setPlayingId(null);
        },
      );
    },
    [playingId],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "200" });
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/biblioteca?${queryString}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { musicas: Musica[]; total: number };
      setMusicas(data.musicas);
      setTotal(data.total);
    } catch {
      setError("Não foi possível carregar a biblioteca.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1300px] px-3 py-6 sm:px-4">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onPause={() => setPlayingId(null)}
        className="hidden"
      />
      {audioError ?
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {audioError}
        </div>
      : null}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Criação / Biblioteca musical
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca musical</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Acervo canônico — uma faixa por gravação. Cada música mostra suas tags: criativas (cor por
            criativo), análise local (BPM/mood) e metadados externos.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <strong className="text-slate-700 dark:text-slate-200">{total}</strong> música{total === 1 ? "" : "s"}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchDraft);
        }}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar título, artista ou ISRC</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Ex.: U2, Beautiful Day"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">Todos</option>
            <option value="pronta">Pronta</option>
            <option value="processando">Processando</option>
            <option value="revisao_duplicata">Revisão duplicata</option>
            <option value="pendente">Pendente</option>
            <option value="erro">Erro</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          Filtrar
        </button>
      </form>

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : musicas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-16 text-center dark:border-slate-700">
          <div className="text-3xl">🎵</div>
          <div className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            A biblioteca está vazia
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            As músicas aparecem aqui depois de passarem pelo Upload e pela Fila de processamento
            (dedupe, ponto de mix, normalização e tags).
          </p>
        </div>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="hidden grid-cols-[40px_1fr_1.6fr_140px_60px_60px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 lg:grid">
            <span />
            <span>Título</span>
            <span>Tags</span>
            <span>Gravadora</span>
            <span className="text-center">BPM</span>
            <span className="text-right">⏱</span>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {musicas.map((m) => (
              <li
                key={m.id}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[40px_1fr_1.6fr_140px_60px_60px] lg:items-center"
              >
                {m.previewUrl ?
                  <button
                    type="button"
                    onClick={() => togglePlay(m)}
                    aria-label={playingId === m.id ? "Pausar" : "Tocar"}
                    title={playingId === m.id ? "Pausar" : "Tocar"}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition ${
                      playingId === m.id ?
                        "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {playingId === m.id ? "⏸" : "▶"}
                  </button>
                : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-base text-slate-300 dark:bg-slate-800">
                    🎵
                  </div>
                }
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {m.titulo || "(sem título)"}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {m.artista || "—"}
                    {m.ano ? ` · ${m.ano}` : ""}
                    {m.status !== "pronta" ?
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.tagsManuais.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex rounded px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: t.cor, color: readableText(t.cor) }}
                    >
                      {t.nome}
                    </span>
                  ))}
                  {m.energia != null ?
                    <AutoChip fonte="local" valor={`Energia ${Math.round(m.energia * 100)}`} />
                  : null}
                  {m.tagsAuto.map((t, i) => (
                    <AutoChip key={`${t.fonte}-${i}`} fonte={t.fonte} valor={t.valor} />
                  ))}
                  {m.tagsManuais.length === 0 && m.tagsAuto.length === 0 && m.energia == null ?
                    <span className="text-[11px] text-slate-400">sem tags</span>
                  : null}
                </div>
                <div className="truncate text-xs text-slate-500">{m.gravadora || "—"}</div>
                <div className="text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  {m.bpm ?? "—"}
                </div>
                <div className="text-right text-xs tabular-nums text-slate-500">
                  {formatDuration(m.durationMs)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
    </div>
  );
}

function AutoChip({ fonte, valor }: { fonte: string; valor: string }) {
  const prefix = TAG_SOURCE_LABEL[fonte] ?? fonte.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <span className="font-bold text-slate-400">[{prefix}]</span>
      {valor}
    </span>
  );
}
