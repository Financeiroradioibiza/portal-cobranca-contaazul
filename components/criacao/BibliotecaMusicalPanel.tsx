"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TAG_SOURCE_LABEL } from "@/lib/criacao/bibliotecaService";

type AutoTag = { fonte: string; chave?: string; valor: string };
type ManualTag = { id: string; nome: string; cor: string };
type TagCriativo = { id: string; nome: string; cor: string; criativoNome: string; usoCount: number };

const CORES_SUGERIDAS = [
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7",
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#64748b",
];
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
  rejeicoesCount: number;
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
  const [tags, setTags] = useState<TagCriativo[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagFor, setTagFor] = useState<Musica | null>(null);
  const [rejectFor, setRejectFor] = useState<Musica | null>(null);

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch("/api/criacao/tags");
      if (!res.ok) return;
      const data = (await res.json()) as { tags: TagCriativo[] };
      setTags(data.tags);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowTagManager(true)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            🏷 Gerenciar tags
          </button>
          <div className="text-right text-xs text-slate-500">
            <strong className="text-slate-700 dark:text-slate-200">{total}</strong> música{total === 1 ? "" : "s"}
          </div>
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
                    {m.rejeicoesCount > 0 ?
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                        rejeitada ×{m.rejeicoesCount}
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
                  <button
                    type="button"
                    onClick={() => setTagFor(m)}
                    title="Tags criativas"
                    className="inline-flex h-5 items-center rounded border border-dashed border-slate-300 px-1.5 text-[10px] font-bold text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600"
                  >
                    + tag
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectFor(m)}
                    title="Rejeitar faixa (Wizard IA evita)"
                    className="inline-flex h-5 items-center rounded border border-dashed border-red-200 px-1.5 text-[10px] font-bold text-red-400 hover:border-red-400 hover:text-red-600 dark:border-red-900"
                  >
                    🚫
                  </button>
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

      {showTagManager ?
        <TagManagerModal
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onChanged={async () => {
            await loadTags();
            await load();
          }}
        />
      : null}

      {tagFor ?
        <TagAssignModal
          musica={tagFor}
          tags={tags}
          onClose={() => setTagFor(null)}
          onChanged={async () => {
            await loadTags();
            await load();
          }}
        />
      : null}

      {rejectFor ?
        <RejeicaoModal
          musica={rejectFor}
          onClose={() => setRejectFor(null)}
          onChanged={load}
        />
      : null}
    </div>
  );
}

function TagManagerModal({
  tags,
  onClose,
  onChanged,
}: {
  tags: TagCriativo[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES_SUGERIDAS[0]);
  const [busy, setBusy] = useState(false);

  async function criar() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/criacao/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), cor }),
      });
      setNome("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function recolor(id: string, novaCor: string) {
    await fetch(`/api/criacao/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cor: novaCor }),
    });
    await onChanged();
  }

  async function remover(id: string) {
    if (!confirm("Excluir esta tag de todas as músicas?")) return;
    await fetch(`/api/criacao/tags/${id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold">Tags criativas</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold text-slate-500">Nova tag</div>
          <div className="flex items-center gap-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void criar()}
              placeholder="Ex.: Lounge Style (Lauro)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={() => void criar()}
              disabled={busy || !nome.trim()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              Criar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CORES_SUGERIDAS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={`h-6 w-6 rounded-full border-2 ${cor === c ? "border-slate-900 dark:border-white" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {tags.length === 0 ?
            <div className="py-8 text-center text-sm text-slate-400">Nenhuma tag criada ainda.</div>
          : <ul className="space-y-1">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className="inline-flex rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: t.cor, color: readableText(t.cor) }}>
                    {t.nome}
                  </span>
                  <span className="text-xs text-slate-400">{t.usoCount} uso{t.usoCount === 1 ? "" : "s"}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {CORES_SUGERIDAS.slice(0, 7).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => void recolor(t.id, c)}
                        className="h-4 w-4 rounded-full border border-white/40"
                        style={{ background: c }}
                        aria-label={`cor ${c}`}
                      />
                    ))}
                    <button type="button" onClick={() => void remover(t.id)} className="ml-1 text-slate-300 hover:text-red-600" title="Excluir">🗑</button>
                  </div>
                </li>
              ))}
            </ul>
          }
        </div>
      </div>
    </div>
  );
}

function TagAssignModal({
  musica,
  tags,
  onClose,
  onChanged,
}: {
  musica: Musica;
  tags: TagCriativo[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [assigned, setAssigned] = useState<Set<string>>(new Set(musica.tagsManuais.map((t) => t.id)));
  const [busy, setBusy] = useState(false);

  async function toggle(tagId: string) {
    if (busy) return;
    setBusy(true);
    const has = assigned.has(tagId);
    try {
      if (has) {
        await fetch(`/api/criacao/musicas/${musica.id}/tags/${tagId}`, { method: "DELETE" });
        setAssigned((prev) => {
          const n = new Set(prev);
          n.delete(tagId);
          return n;
        });
      } else {
        await fetch(`/api/criacao/musicas/${musica.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId }),
        });
        setAssigned((prev) => new Set(prev).add(tagId));
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{musica.titulo || "(sem título)"}</div>
            <div className="truncate text-xs text-slate-500">{musica.artista}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4">
          {tags.length === 0 ?
            <div className="text-sm text-slate-400">
              Nenhuma tag criada. Use “Gerenciar tags” para criar.
            </div>
          : <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = assigned.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void toggle(t.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${on ? "" : "opacity-40 grayscale hover:opacity-70"}`}
                    style={{ background: t.cor, color: readableText(t.cor) }}
                  >
                    {on ? "✓ " : ""}{t.nome}
                  </button>
                );
              })}
            </div>
          }
        </div>
      </div>
    </div>
  );
}

function RejeicaoModal({
  musica,
  onClose,
  onChanged,
}: {
  musica: Musica;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  type Cliente = { ref: string; nome: string };
  type Rej = { id: string; clienteRef: string; motivo: string };

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [rejeicoes, setRejeicoes] = useState<Rej[]>([]);
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rc, rr] = await Promise.all([
      fetch("/api/criacao/clientes"),
      fetch(`/api/criacao/musicas/${musica.id}/rejeicoes`),
    ]);
    if (rc.ok) setClientes(((await rc.json()) as { clientes: Cliente[] }).clientes ?? []);
    if (rr.ok) setRejeicoes(((await rr.json()) as { rejeicoes: Rej[] }).rejeicoes ?? []);
  }, [musica.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const rejRefs = new Set(rejeicoes.map((r) => r.clienteRef));
    return clientes
      .filter((c) => !rejRefs.has(c.ref))
      .filter((c) => !q || c.nome.toLowerCase().includes(q))
      .slice(0, 30);
  }, [clientes, rejeicoes, busca]);

  async function rejeitar(clienteRef: string) {
    setBusy(true);
    try {
      await fetch(`/api/criacao/musicas/${musica.id}/rejeicoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteRef, motivo: motivo.trim() }),
      });
      setBusca("");
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remover(clienteRef: string) {
    setBusy(true);
    try {
      await fetch(
        `/api/criacao/musicas/${musica.id}/rejeicoes?clienteRef=${encodeURIComponent(clienteRef)}`,
        { method: "DELETE" },
      );
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">Rejeitar faixa</div>
            <div className="truncate text-xs text-slate-500">
              {musica.artista} — {musica.titulo}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <p className="mb-3 text-xs text-slate-500">
            Faixas rejeitadas são evitadas pelo Wizard IA. Marque por cliente quando uma gravação não serve
            para aquele ponto de venda.
          </p>
          {rejeicoes.length > 0 ?
            <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {rejeicoes.map((r) => {
                const nome = clientes.find((c) => c.ref === r.clienteRef)?.nome ?? r.clienteRef;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{nome}</div>
                      {r.motivo ?
                        <div className="truncate text-xs text-slate-400">{r.motivo}</div>
                      : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remover(r.clienteRef)}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700"
                    >
                      remover
                    </button>
                  </li>
                );
              })}
            </ul>
          : null}
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente para rejeitar…"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            {filtrados.map((c) => (
              <li key={c.ref}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void rejeitar(c.ref)}
                  className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {c.nome}
                </button>
              </li>
            ))}
            {filtrados.length === 0 ?
              <li className="px-3 py-4 text-center text-xs text-slate-400">Nenhum cliente disponível.</li>
            : null}
          </ul>
        </div>
      </div>
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
