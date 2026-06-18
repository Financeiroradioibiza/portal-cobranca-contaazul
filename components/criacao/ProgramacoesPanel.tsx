"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FORMATO_LABEL: Record<string, string> = {
  mp3_128_mono: "128 kbps mono",
  mp3_128_stereo: "128 kbps estéreo",
  mp3_192_mono: "192 kbps mono",
  mp3_192_stereo: "192 kbps estéreo",
};
const FORMATOS = ["mp3_128_mono", "mp3_128_stereo", "mp3_192_mono", "mp3_192_stereo"];
const VELOCIDADE_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

type Cliente = { ref: string; nome: string; pdvCount: number };

type ProgramacaoRow = {
  id: string;
  nome: string;
  clienteRef: string;
  clienteNome: string;
  formatoPadrao: string;
  publicada: boolean;
  criativoNome: string;
  pastasCount: number;
  musicasCount: number;
  updatedAt: string;
};

type PastaMusicaView = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  status: string;
  mixSegundosFinais: number | null;
  previewUrl: string | null;
};
type PastaView = { id: string; nome: string; velocidade: string; sortOrder: number; musicas: PastaMusicaView[] };
type ProgramacaoDetail = {
  id: string;
  nome: string;
  clienteRef: string;
  clienteNome: string;
  formatoPadrao: string;
  publicada: boolean;
  criativoNome: string;
  pastas: PastaView[];
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function ProgramacoesPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const play = useCallback(
    (m: PastaMusicaView) => {
      const audio = audioRef.current;
      if (!audio || !m.previewUrl) return;
      const key = `${m.id}`;
      if (playingId === key) {
        audio.pause();
        return;
      }
      audio.src = m.previewUrl;
      audio.play().then(() => setPlayingId(key), () => setPlayingId(null));
    },
    [playingId],
  );

  return (
    <div className="mx-auto max-w-[1300px] px-3 py-6 sm:px-4">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} onPause={() => setPlayingId(null)} className="hidden" />
      {selectedId ?
        <ProgramacaoEditor
          id={selectedId}
          onBack={() => setSelectedId(null)}
          playingId={playingId}
          onPlay={play}
        />
      : <ProgramacoesList onOpen={setSelectedId} />}
    </div>
  );
}

function ProgramacoesList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<ProgramacaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/criacao/programacoes${qs}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { programacoes: ProgramacaoRow[] };
      setRows(data.programacoes);
    } catch {
      setError("Não foi possível carregar as programações.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Criação / Programações
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Programações</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cada programação é amarrada a um cliente e contém pastas (playlists). Monte as pastas com
            faixas da biblioteca e defina o formato de entrega.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          + Nova programação
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchDraft);
        }}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar por nome ou cliente</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Ex.: Padrão, Reserva…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          Filtrar
        </button>
      </form>

      {creating ?
        <CreateProgramacaoForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id);
          }}
        />
      : null}

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : rows.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-16 text-center dark:border-slate-700">
          <div className="text-3xl">🎚️</div>
          <div className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Nenhuma programação ainda
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Crie uma programação para um cliente e monte as pastas com faixas da biblioteca.
          </p>
        </div>
      : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{p.nome}</div>
                  <div className="truncate text-xs text-slate-500">{p.clienteNome || p.clienteRef}</div>
                </div>
                {p.publicada ?
                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Publicada
                  </span>
                : <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                    Rascunho
                  </span>
                }
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                <span>📁 {p.pastasCount} pasta{p.pastasCount === 1 ? "" : "s"}</span>
                <span>🎵 {p.musicasCount}</span>
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">
                  {FORMATO_LABEL[p.formatoPadrao] ?? p.formatoPadrao}
                </span>
              </div>
            </button>
          ))}
        </div>
      }
    </>
  );
}

function CreateProgramacaoForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [nome, setNome] = useState("");
  const [formato, setFormato] = useState("mp3_128_mono");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/criacao/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.clientes) setClientes(d.clientes as Cliente[]);
      })
      .catch(() => {});
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes).slice(0, 40);
  }, [clientes, busca]);

  async function submit() {
    if (!clienteSel) {
      setMsg("Escolha o cliente.");
      return;
    }
    if (!nome.trim()) {
      setMsg("Dê um nome à programação.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/criacao/programacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteRef: clienteSel.ref,
          clienteNome: clienteSel.nome,
          nome: nome.trim(),
          formatoPadrao: formato,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { id: string };
      onCreated(data.id);
    } catch {
      setMsg("Não foi possível criar a programação.");
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Nova programação</h2>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
          fechar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Cliente</span>
          {clienteSel ?
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
              <span className="truncate text-sm font-medium">{clienteSel.nome}</span>
              <button
                type="button"
                onClick={() => setClienteSel(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                trocar
              </button>
            </div>
          : <>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={clientes.length ? "Buscar cliente da produção…" : "Carregando clientes…"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              {busca.trim() && filtrados.length > 0 ?
                <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  {filtrados.map((c) => (
                    <button
                      type="button"
                      key={c.ref}
                      onClick={() => {
                        setClienteSel(c);
                        setBusca("");
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
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Nome da programação</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Padrão"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Formato de entrega</span>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {FORMATOS.map((f) => (
              <option key={f} value={f}>
                {FORMATO_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {msg ? <div className="mt-2 text-sm text-red-600">{msg}</div> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? "Criando…" : "Criar e abrir"}
        </button>
      </div>
    </div>
  );
}

function ProgramacaoEditor({
  id,
  onBack,
  playingId,
  onPlay,
}: {
  id: string;
  onBack: () => void;
  playingId: string | null;
  onPlay: (m: PastaMusicaView) => void;
}) {
  const [prog, setProg] = useState<ProgramacaoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novaPasta, setNovaPasta] = useState("");
  const [addTo, setAddTo] = useState<PastaView | null>(null);
  const [showPublicar, setShowPublicar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/programacoes/${id}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { programacao: ProgramacaoDetail };
      setProg(data.programacao);
    } catch {
      setError("Não foi possível carregar a programação.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchProg(patch: Record<string, unknown>) {
    await fetch(`/api/criacao/programacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function addPasta() {
    const nome = novaPasta.trim();
    if (!nome) return;
    setNovaPasta("");
    await fetch(`/api/criacao/programacoes/${id}/pastas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    await load();
  }

  async function delPasta(pastaId: string) {
    if (!confirm("Excluir esta pasta e suas faixas?")) return;
    await fetch(`/api/criacao/pastas/${pastaId}`, { method: "DELETE" });
    await load();
  }

  async function setVelocidade(pastaId: string, velocidade: string) {
    await fetch(`/api/criacao/pastas/${pastaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ velocidade }),
    });
    await load();
  }

  async function removeMusica(pastaId: string, musicaId: string) {
    await fetch(`/api/criacao/pastas/${pastaId}/musicas/${musicaId}`, { method: "DELETE" });
    await load();
  }

  async function moveMusica(pasta: PastaView, index: number, dir: -1 | 1) {
    const next = [...pasta.musicas];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setProg((prev) =>
      prev
        ? { ...prev, pastas: prev.pastas.map((f) => (f.id === pasta.id ? { ...f, musicas: next } : f)) }
        : prev,
    );
    await fetch(`/api/criacao/pastas/${pasta.id}/musicas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicaIds: next.map((m) => m.id) }),
    });
  }

  if (loading) return <div className="py-10 text-sm text-slate-500">Carregando…</div>;
  if (error || !prog) return <div className="py-10 text-sm text-red-600">{error ?? "Não encontrada."}</div>;

  return (
    <>
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500 hover:text-slate-700">
        ← Voltar para programações
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {prog.clienteNome || prog.clienteRef}
          </div>
          <input
            defaultValue={prog.nome}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== prog.nome) void patchProg({ nome: v });
            }}
            className="-ml-1 w-full rounded px-1 text-2xl font-bold tracking-tight outline-none focus:bg-slate-50 dark:focus:bg-slate-800"
          />
          {prog.criativoNome ?
            <div className="mt-1 text-xs text-slate-400">por {prog.criativoNome}</div>
          : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={prog.formatoPadrao}
            onChange={(e) => void patchProg({ formatoPadrao: e.target.value })}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            title="Formato de entrega"
          >
            {FORMATOS.map((f) => (
              <option key={f} value={f}>
                {FORMATO_LABEL[f]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowPublicar(true)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              prog.publicada ?
                "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            }`}
          >
            {prog.publicada ? "Republicar no Player" : "Enviar ao Player 5"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={novaPasta}
          onChange={(e) => setNovaPasta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addPasta();
          }}
          placeholder="Nome da nova pasta (ex.: POP, Bossa Up…)"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          type="button"
          onClick={() => void addPasta()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          + Pasta
        </button>
      </div>

      {prog.pastas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Crie a primeira pasta (playlist) e adicione faixas da biblioteca.
        </div>
      : <div className="space-y-4">
          {prog.pastas.map((pasta) => (
            <div
              key={pasta.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{pasta.nome}</span>
                  <span className="text-xs text-slate-400">
                    {pasta.musicas.length} faixa{pasta.musicas.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={pasta.velocidade}
                    onChange={(e) => void setVelocidade(pasta.id, e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                    title="Ritmo da pasta"
                  >
                    {Object.entries(VELOCIDADE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        Ritmo: {l}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAddTo(pasta)}
                    className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  >
                    + Músicas
                  </button>
                  <button
                    type="button"
                    onClick={() => void delPasta(pasta.id)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:text-red-600"
                    title="Excluir pasta"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {pasta.musicas.length === 0 ?
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  Pasta vazia — clique em “+ Músicas” para adicionar da biblioteca.
                </div>
              : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pasta.musicas.map((m, idx) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <div className="flex flex-col text-slate-300">
                        <button
                          type="button"
                          onClick={() => void moveMusica(pasta, idx, -1)}
                          disabled={idx === 0}
                          className="leading-none hover:text-slate-600 disabled:opacity-20"
                          title="Subir"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveMusica(pasta, idx, 1)}
                          disabled={idx === pasta.musicas.length - 1}
                          className="leading-none hover:text-slate-600 disabled:opacity-20"
                          title="Descer"
                        >
                          ▼
                        </button>
                      </div>
                      {m.previewUrl ?
                        <button
                          type="button"
                          onClick={() => onPlay(m)}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs ${
                            playingId === m.id ?
                              "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {playingId === m.id ? "⏸" : "▶"}
                        </button>
                      : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-300 dark:bg-slate-800">
                          🎵
                        </span>
                      }
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-100">{m.titulo || "(sem título)"}</div>
                        <div className="truncate text-xs text-slate-500">{m.artista || "—"}</div>
                      </div>
                      {m.mixSegundosFinais != null ?
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800" title="Ponto de mix (segundos finais)">
                          mix {m.mixSegundosFinais}s
                        </span>
                      : null}
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatDuration(m.durationMs)}</span>
                      <button
                        type="button"
                        onClick={() => void removeMusica(pasta.id, m.id)}
                        className="shrink-0 text-slate-300 hover:text-red-600"
                        title="Remover da pasta"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              }
            </div>
          ))}
        </div>
      }

      <VinhetasSection programacaoId={id} />

      <CronogramaSection programacaoId={id} pastas={prog.pastas.map((p) => ({ id: p.id, nome: p.nome }))} />

      {addTo ?
        <AddMusicasModal
          pasta={addTo}
          onClose={() => setAddTo(null)}
          onAdded={async () => {
            setAddTo(null);
            await load();
          }}
        />
      : null}

      {showPublicar ?
        <PublicarModal
          programacaoId={id}
          clienteNome={prog.clienteNome}
          onClose={() => setShowPublicar(false)}
          onDone={async () => {
            setShowPublicar(false);
            await load();
          }}
        />
      : null}
    </>
  );
}

type Vinheta = {
  id: string;
  nome: string;
  tipo: string;
  texto: string;
  voz: string;
  temAudio: boolean;
  previewUrl: string | null;
};

function VinhetasSection({ programacaoId }: { programacaoId: string }) {
  const [vinhetas, setVinhetas] = useState<Vinheta[]>([]);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"tts" | "audio">("tts");
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`);
      if (!res.ok) return;
      const data = (await res.json()) as { vinhetas: Vinheta[] };
      setVinhetas(data.vinhetas);
    } catch {
      /* silencioso */
    }
  }, [programacaoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function criar() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), tipo }),
      });
      setNome("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Excluir esta vinheta?")) return;
    await fetch(`/api/criacao/vinhetas/${id}`, { method: "DELETE" });
    await load();
  }

  async function salvarTts(v: Vinheta, texto: string, voz: string) {
    await fetch(`/api/criacao/vinhetas/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, voz }),
    });
    await load();
  }

  async function enviarAudio(v: Vinheta, file: File) {
    setBusy(true);
    try {
      const tk = await fetch(`/api/criacao/vinhetas/${v.id}/upload-ticket`, { method: "POST" });
      if (!tk.ok) throw new Error();
      const { ingestUrl, token } = (await tk.json()) as { ingestUrl: string; token: string };
      const fd = new FormData();
      fd.append("token", token);
      fd.append("file", file, file.name);
      await fetch(ingestUrl, { method: "POST", body: fd });
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  function togglePlay(v: Vinheta) {
    const a = audioRef.current;
    if (!a || !v.previewUrl) return;
    if (playing === v.id) {
      a.pause();
      return;
    }
    a.src = v.previewUrl;
    a.play().then(() => setPlaying(v.id), () => setPlaying(null));
  }

  return (
    <div className="mt-8">
      <audio ref={audioRef} onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} className="hidden" />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Vinhetas</h2>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void criar()}
          placeholder="Nome da vinheta (ex.: Aviso de promoção)"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "tts" | "audio")}
          className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          <option value="tts">Locução (TTS)</option>
          <option value="audio">Áudio (upload)</option>
        </select>
        <button
          type="button"
          onClick={() => void criar()}
          disabled={busy || !nome.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          + Vinheta
        </button>
      </div>

      {vinhetas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
          Sem vinhetas. Crie locuções (TTS) ou suba um áudio para atrelar a esta programação.
        </div>
      : <div className="space-y-2">
          {vinhetas.map((v) => (
            <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                    {v.tipo === "audio" ? "Áudio" : "TTS"}
                  </span>
                  <span className="text-sm font-semibold">{v.nome}</span>
                </div>
                <div className="flex items-center gap-2">
                  {v.temAudio ?
                    <button
                      type="button"
                      onClick={() => togglePlay(v)}
                      className={`flex h-7 w-7 items-center justify-center rounded text-xs ${playing === v.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
                    >
                      {playing === v.id ? "⏸" : "▶"}
                    </button>
                  : null}
                  <button type="button" onClick={() => void remover(v.id)} className="text-slate-300 hover:text-red-600" title="Excluir">🗑</button>
                </div>
              </div>

              {v.tipo === "tts" ?
                <TtsEditor vinheta={v} onSave={salvarTts} />
              : <div className="mt-2 flex items-center gap-3">
                  <input
                    ref={(el) => {
                      fileInputs.current[v.id] = el;
                    }}
                    type="file"
                    accept="audio/mpeg,.mp3"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void enviarAudio(v, f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputs.current[v.id]?.click()}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                  >
                    {v.temAudio ? "Trocar áudio" : "Enviar áudio (.mp3)"}
                  </button>
                  <span className="text-xs text-slate-400">
                    {v.temAudio ? "Áudio enviado (direto ao cloud2)" : "Nenhum áudio ainda"}
                  </span>
                </div>
              }
            </div>
          ))}
        </div>
      }
    </div>
  );
}

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Agendamento = {
  id: string;
  alvoTipo: string;
  alvoId: string;
  alvoNome: string;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  dataInicio: string | null;
  dataFim: string | null;
  frequenciaMin: number | null;
  prioridade: number;
  ativo: boolean;
};

function diasLabel(csv: string): string {
  if (!csv.trim()) return "todos os dias";
  const ds = csv.split(",").map((n) => DOW[Number(n)] ?? "").filter(Boolean);
  return ds.join(", ");
}

function CronogramaSection({
  programacaoId,
  pastas,
}: {
  programacaoId: string;
  pastas: { id: string; nome: string }[];
}) {
  const [ags, setAgs] = useState<Agendamento[]>([]);
  const [vinhetas, setVinhetas] = useState<{ id: string; nome: string }[]>([]);
  const [open, setOpen] = useState(false);

  // form
  const [alvo, setAlvo] = useState("");
  const [dias, setDias] = useState<Set<number>>(new Set());
  const [hIni, setHIni] = useState("08:00");
  const [hFim, setHFim] = useState("22:00");
  const [dIni, setDIni] = useState("");
  const [dFim, setDFim] = useState("");
  const [freq, setFreq] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ra, rv] = await Promise.all([
        fetch(`/api/criacao/programacoes/${programacaoId}/agendamentos`),
        fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`),
      ]);
      if (ra.ok) setAgs(((await ra.json()) as { agendamentos: Agendamento[] }).agendamentos);
      if (rv.ok) setVinhetas(((await rv.json()) as { vinhetas: { id: string; nome: string }[] }).vinhetas);
    } catch {
      /* silencioso */
    }
  }, [programacaoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const alvoIsVinheta = alvo.startsWith("vinheta:");

  async function criar() {
    if (!alvo || busy) return;
    const [alvoTipo, alvoId] = alvo.split(":");
    setBusy(true);
    try {
      await fetch(`/api/criacao/programacoes/${programacaoId}/agendamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alvoTipo,
          alvoId,
          diasSemana: Array.from(dias).sort((a, b) => a - b).join(","),
          horaInicio: hIni,
          horaFim: hFim,
          dataInicio: dIni || undefined,
          dataFim: dFim || undefined,
          frequenciaMin: alvoTipo === "vinheta" && freq ? Number(freq) : undefined,
        }),
      });
      setDias(new Set());
      setDIni("");
      setDFim("");
      setFreq("");
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    await fetch(`/api/criacao/agendamentos/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleAtivo(a: Agendamento) {
    await fetch(`/api/criacao/agendamentos/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !a.ativo }),
    });
    await load();
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Cronograma</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          {open ? "Fechar" : "+ Regra"}
        </button>
      </div>

      {open ?
        <div className="mb-3 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">O que toca</span>
              <select
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Selecione…</option>
                {pastas.length > 0 ?
                  <optgroup label="Pastas">
                    {pastas.map((p) => (
                      <option key={p.id} value={`pasta:${p.id}`}>
                        {p.nome}
                      </option>
                    ))}
                  </optgroup>
                : null}
                {vinhetas.length > 0 ?
                  <optgroup label="Vinhetas">
                    {vinhetas.map((v) => (
                      <option key={v.id} value={`vinheta:${v.id}`}>
                        {v.nome}
                      </option>
                    ))}
                  </optgroup>
                : null}
              </select>
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Dias da semana</span>
              <div className="flex flex-wrap gap-1">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDias((prev) => {
                        const n = new Set(prev);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={`h-8 w-9 rounded text-xs font-semibold ${
                      dias.has(i) ?
                        "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-200 text-slate-500 dark:border-slate-700"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">Nenhum marcado = todos os dias.</div>
            </div>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Horário</span>
              <div className="flex items-center gap-2">
                <input type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
                <span className="text-slate-400">até</span>
                <input type="time" value={hFim} onChange={(e) => setHFim(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Período (opcional)</span>
              <div className="flex items-center gap-2">
                <input type="date" value={dIni} onChange={(e) => setDIni(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
                <span className="text-slate-400">a</span>
                <input type="date" value={dFim} onChange={(e) => setDFim(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </div>
            </label>
            {alvoIsVinheta ?
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Repetir a cada (min)</span>
                <input
                  type="number"
                  min={1}
                  value={freq}
                  onChange={(e) => setFreq(e.target.value)}
                  placeholder="ex.: 30"
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            : null}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void criar()}
              disabled={busy || !alvo}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              Adicionar regra
            </button>
          </div>
        </div>
      : null}

      {ags.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
          Sem regras de cronograma. Por padrão, as pastas tocam o tempo todo.
        </div>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ags.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${a.ativo ? "" : "opacity-50"}`}>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                  {a.alvoTipo}
                </span>
                <span className="font-semibold">{a.alvoNome}</span>
                <span className="text-slate-500">{diasLabel(a.diasSemana)}</span>
                <span className="tabular-nums text-slate-500">{a.horaInicio}–{a.horaFim}</span>
                {a.dataInicio || a.dataFim ?
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {a.dataInicio ?? "…"} → {a.dataFim ?? "…"}
                  </span>
                : null}
                {a.frequenciaMin ?
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                    a cada {a.frequenciaMin}min
                  </span>
                : null}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => void toggleAtivo(a)} className="text-xs text-slate-400 hover:text-slate-600">
                    {a.ativo ? "pausar" : "ativar"}
                  </button>
                  <button type="button" onClick={() => void remover(a.id)} className="text-slate-300 hover:text-red-600" title="Excluir">🗑</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
    </div>
  );
}

function TtsEditor({
  vinheta,
  onSave,
}: {
  vinheta: Vinheta;
  onSave: (v: Vinheta, texto: string, voz: string) => void | Promise<void>;
}) {
  const [texto, setTexto] = useState(vinheta.texto);
  const [voz, setVoz] = useState(vinheta.voz);
  const [saving, setSaving] = useState(false);
  const dirty = texto !== vinheta.texto || voz !== vinheta.voz;

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="Texto da locução…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
      <div className="flex items-center gap-2">
        <input
          value={voz}
          onChange={(e) => setVoz(e.target.value)}
          placeholder="Voz (ex.: feminina BR)"
          className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(vinheta, texto, voz);
            setSaving(false);
          }}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? "Salvando…" : "Salvar texto"}
        </button>
        <span className="text-[10px] text-slate-400">A síntese de voz é gerada na entrega.</span>
      </div>
    </div>
  );
}

type BibRow = { id: string; titulo: string; artista: string; durationMs: number | null };

function AddMusicasModal({
  pasta,
  onClose,
  onAdded,
}: {
  pasta: PastaView;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState<BibRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const jaNaPasta = useMemo(() => new Set(pasta.musicas.map((m) => m.id)), [pasta.musicas]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100", status: "pronta" });
      if (busca.trim()) params.set("search", busca.trim());
      const res = await fetch(`/api/criacao/biblioteca?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { musicas: BibRow[] };
      setRows(data.musicas);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    if (sel.size === 0) return;
    setSaving(true);
    try {
      await fetch(`/api/criacao/pastas/${pasta.id}/musicas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicaIds: Array.from(sel) }),
      });
      onAdded();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold">
            Adicionar à pasta <span className="text-slate-500">“{pasta.nome}”</span>
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusca(draft);
          }}
          className="flex gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"
        >
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Buscar na biblioteca (título, artista, ISRC)…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            Buscar
          </button>
        </form>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ?
            <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
          : rows.length === 0 ?
            <div className="py-8 text-center text-sm text-slate-400">Nenhuma faixa pronta encontrada.</div>
          : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((m) => {
                const already = jaNaPasta.has(m.id);
                const checked = sel.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => toggle(m.id)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                        already ? "opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          checked ?
                            "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                          : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-100">{m.titulo || "(sem título)"}</div>
                        <div className="truncate text-xs text-slate-500">{m.artista || "—"}</div>
                      </div>
                      {already ? <span className="shrink-0 text-[10px] text-slate-400">já na pasta</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          }
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-xs text-slate-500">{sel.size} selecionada{sel.size === 1 ? "" : "s"}</span>
          <button
            type="button"
            onClick={() => void add()}
            disabled={sel.size === 0 || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {saving ? "Adicionando…" : `Adicionar ${sel.size || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

type GatewayCliente = { id: number; nome: string; pdvs: number };

function PublicarModal({
  programacaoId,
  clienteNome,
  onClose,
  onDone,
}: {
  programacaoId: string;
  clienteNome: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [clientes, setClientes] = useState<GatewayCliente[]>([]);
  const [selId, setSelId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/criacao/gateway-clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.clientes) return;
        const list = d.clientes as GatewayCliente[];
        setClientes(list);
        const alvo = clienteNome.trim().toLowerCase();
        const sug =
          list.find((c) => c.nome.trim().toLowerCase() === alvo) ??
          list.find((c) => c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase()));
        if (sug) setSelId(sug.id);
        else if (list.length === 1) setSelId(list[0].id);
      })
      .catch(() => setError("Não foi possível carregar clientes do Player."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clienteNome]);

  async function publicar() {
    if (selId === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/publicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteIdGateway: selId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        playlists?: number;
        musicas?: number;
        semArquivo?: number;
        clienteGatewayNome?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "publicar_falhou");
      setResultado(
        `Publicado para ${data.clienteGatewayNome ?? "Player"}: ${data.playlists ?? 0} pasta(s), ${data.musicas ?? 0} faixa(s)` +
          (data.semArquivo ? ` (${data.semArquivo} sem arquivo de áudio)` : ""),
      );
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao publicar.");
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
          <h2 className="text-sm font-bold">Enviar ao Player 5</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-slate-500">
            Sincroniza pastas e faixas com o webservice do Player 5 (cloud2). O áudio continua sendo baixado
            direto do cloud2 — nada passa pelo Netlify.
          </p>
          {loading ?
            <div className="py-6 text-center text-sm text-slate-400">Carregando clientes do gateway…</div>
          : clientes.length === 0 ?
            <div className="py-6 text-center text-sm text-red-600">
              Nenhum cliente no gateway. Cadastre um cliente de teste no Player 5 primeiro.
            </div>
          : <>
              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Cliente no Player (gateway)</span>
                <select
                  value={selId}
                  onChange={(e) => setSelId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Selecione…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.pdvs} PDV{c.pdvs === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
              </label>
              {error ?
                <div className="mb-2 text-sm text-red-600">{error}</div>
              : null}
              {resultado ?
                <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  {resultado}
                </div>
              : null}
              <button
                type="button"
                onClick={() => void publicar()}
                disabled={busy || selId === ""}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {busy ? "Publicando…" : "Confirmar publicação"}
              </button>
            </>
          }
        </div>
      </div>
    </div>
  );
}
