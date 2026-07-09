"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AddMusicasBibliotecaModal } from "@/components/criacao/AddMusicasBibliotecaModal";
import { EscolherPastaEspecialModal } from "@/components/criacao/EscolherPastaEspecialModal";
import { FecharAtualizacaoModal, ProgramacoesAdminPanel } from "@/components/criacao/ProgramacoesAdminPanel";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { VinhetaAudioControls } from "@/components/criacao/VinhetaAudioControls";
import { uploadVinhetaAudio, vinhetaUploadErrorMessage } from "@/lib/criacao/vinhetaUploadClient";
import { marcarAtualizacaoAberta } from "@/lib/criacao/marcarAtualizacaoAbertaClient";
import { AtlCricaAberturaAviso } from "@/components/criacao/AtlCricaAberturaAviso";
import { isAtlCricaAbertura } from "@/lib/criacao/atlCricaConstants";
import { CronogramaAlvoBadges, DOW, diasLabel } from "@/components/criacao/CronogramaAlvoBadges";
import type { AgendamentoRow } from "@/lib/criacao/agendamentoService";
import { formatPastaMusicaAddedAt, isMusicaNovaNaAtualizacao } from "@/lib/criacao/pastaMusicaUi";

type SortKey = "titulo" | "artista" | "addedAt";

const FORMATO_LABEL: Record<string, string> = {
  mp3_128_mono: "128 kbps mono",
  mp3_128_stereo: "128 kbps estéreo",
  mp3_192_mono: "192 kbps mono",
  mp3_192_stereo: "192 kbps estéreo",
};
const FORMATOS = ["mp3_128_mono", "mp3_128_stereo", "mp3_192_mono", "mp3_192_stereo"];
const VELOCIDADE_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

type PastaMusicaView = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  status: string;
  mixSegundosFinais: number | null;
  previewUrl: string | null;
  addedAt: string | null;
};
type PastaView = {
  id: string;
  nome: string;
  velocidade: string;
  selecionavel: boolean;
  sortOrder: number;
  musicas: PastaMusicaView[];
};
type ProgramacaoDetail = {
  id: string;
  nome: string;
  clienteRef: string;
  clienteNome: string;
  formatoPadrao: string;
  publicada: boolean;
  criativoNome: string;
  atualizacaoAberta: boolean;
  atualizacaoAbertaEm: string | null;
  atualizacaoAbertaPor: string;
  pastas: PastaView[];
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const OPEN_PROG_KEY = "criacao-open-prog";
const pastasAbertasKey = (progId: string) => `criacao-pastas-abertas:${progId}`;

function readPersistedPastasAbertas(progId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(pastasAbertasKey(progId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writePersistedPastasAbertas(progId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(pastasAbertasKey(progId), JSON.stringify([...ids]));
}

export function ProgramacoesPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const open = sessionStorage.getItem(OPEN_PROG_KEY);
    if (open) {
      setSelectedId(open);
      sessionStorage.removeItem(OPEN_PROG_KEY);
    }
  }, []);

  if (selectedId) {
    return (
      <div className="mx-auto max-w-[1300px] px-3 py-6 sm:px-4">
        <ProgramacaoEditor id={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return <ProgramacoesAdminPanel onOpenEditor={setSelectedId} />;
}


function ProgramacaoEditor({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const [prog, setProg] = useState<ProgramacaoDetail | null>(null);
  const [ags, setAgs] = useState<AgendamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novaPasta, setNovaPasta] = useState("");
  const [novaPastaSelecionavel, setNovaPastaSelecionavel] = useState(false);
  const [addTo, setAddTo] = useState<PastaView | null>(null);
  const [showEspecial, setShowEspecial] = useState(false);
  const [selectedByPasta, setSelectedByPasta] = useState<Record<string, Set<string>>>({});
  /** Faixas adicionadas nesta sessão do editor — destaque até fechar a programação. */
  const [sessionAddedIds, setSessionAddedIds] = useState<Set<string>>(() => new Set());
  /** Pastas expandidas — persistidas enquanto a atualização estiver aberta. */
  const [expandedPastas, setExpandedPastas] = useState<Set<string>>(() => readPersistedPastasAbertas(id));
  /** Ordenação por pasta. */
  const [sortByPasta, setSortByPasta] = useState<Record<string, SortKey>>({});
  /** Fechar atualização modal. */
  const [showFechar, setShowFechar] = useState(false);
  const marcouAberta = useRef(false);

  async function registrarEdicao() {
    if (marcouAberta.current) return;
    marcouAberta.current = true;
    await marcarAtualizacaoAberta(id);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, ra] = await Promise.all([
        fetch(`/api/criacao/programacoes/${id}`),
        fetch(`/api/criacao/programacoes/${id}/agendamentos`),
      ]);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { programacao: ProgramacaoDetail };
      setProg(data.programacao);
      if (ra.ok) setAgs(((await ra.json()) as { agendamentos: AgendamentoRow[] }).agendamentos);
      else setAgs([]);
      setSelectedByPasta((prev) => {
        const next: Record<string, Set<string>> = {};
        for (const pasta of data.programacao.pastas) {
          const kept = prev[pasta.id];
          if (!kept?.size) continue;
          const valid = new Set(pasta.musicas.map((m) => m.id));
          const filtered = new Set([...kept].filter((mid) => valid.has(mid)));
          if (filtered.size > 0) next[pasta.id] = filtered;
        }
        return next;
      });
    } catch {
      setError("Não foi possível carregar a programação.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** Recarrega pastas (e metadados) sem piscar a tela inteira — usado pelo cronograma e poll da fila. */
  const reloadSilently = useCallback(async () => {
    try {
      const res = await fetch(`/api/criacao/programacoes/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { programacao: ProgramacaoDetail };
      setProg((prev) => {
        if (prev) {
          const prevByPasta = new Map(prev.pastas.map((p) => [p.id, new Set(p.musicas.map((m) => m.id))]));
          const expandIds: string[] = [];
          const newMusicaIds: string[] = [];
          for (const pasta of data.programacao.pastas) {
            const before = prevByPasta.get(pasta.id) ?? new Set<string>();
            for (const m of pasta.musicas) {
              if (!before.has(m.id)) {
                expandIds.push(pasta.id);
                newMusicaIds.push(m.id);
              }
            }
          }
          if (expandIds.length > 0) {
            setExpandedPastas((exp) => {
              const next = new Set(exp);
              for (const pid of expandIds) next.add(pid);
              writePersistedPastasAbertas(id, next);
              return next;
            });
            setSessionAddedIds((sess) => new Set([...sess, ...newMusicaIds]));
          }
        }
        return data.programacao;
      });
    } catch {
      /* silencioso */
    }
  }, [id]);

  /** Recarrega pastas (e metadados) sem piscar a tela inteira — usado pelo cronograma. */
  const reloadPastasParaCronograma = reloadSilently;

  useEffect(() => {
    void load();
  }, [load]);

  /** Com atualização aberta, mantém expandidas as pastas que receberam faixas novas. */
  useEffect(() => {
    if (!prog?.atualizacaoAberta) return;
    setExpandedPastas((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const pasta of prog.pastas) {
        const hasNova = pasta.musicas.some((m) =>
          isMusicaNovaNaAtualizacao({
            musicaId: m.id,
            addedAt: m.addedAt,
            atualizacaoAberta: prog.atualizacaoAberta,
            atualizacaoAbertaEm: prog.atualizacaoAbertaEm,
          }),
        );
        if (hasNova && !next.has(pasta.id)) {
          next.add(pasta.id);
          changed = true;
        }
      }
      if (changed) writePersistedPastasAbertas(id, next);
      return changed ? next : prev;
    });
  }, [prog, id]);

  /** Com atualização aberta, puxa faixas da fila (ATL CRICA / upload) e atualiza destaque verde. */
  useEffect(() => {
    if (!prog?.atualizacaoAberta) return;
    const tick = async () => {
      try {
        await fetch("/api/criacao/fila/sync-pending", { method: "POST" });
      } catch {
        /* ignore */
      }
      await reloadSilently();
    };
    void tick();
    const t = window.setInterval(() => void tick(), 8000);
    return () => window.clearInterval(t);
  }, [prog?.atualizacaoAberta, reloadSilently]);

  async function patchProg(patch: Record<string, unknown>) {
    await registrarEdicao();
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
    await registrarEdicao();
    await fetch(`/api/criacao/programacoes/${id}/pastas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, selecionavel: novaPastaSelecionavel }),
    });
    setNovaPastaSelecionavel(false);
    await load();
  }

  async function addPastaFromEspecial(pastaEspecialId: string) {
    await registrarEdicao();
    const res = await fetch(`/api/criacao/programacoes/${id}/pastas-from-especial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pastaEspecialId }),
    });
    if (!res.ok) {
      alert("Não foi possível copiar a pasta especial.");
      return;
    }
    const data = (await res.json()) as { added?: number; skipped?: number };
    if ((data.skipped ?? 0) > 0) {
      alert(
        `Pasta criada com ${data.added ?? 0} faixa(s). ${data.skipped} faixa(s) já estavam em outra pasta desta programação.`,
      );
    }
    setShowEspecial(false);
    await load();
  }

  async function delPasta(pastaId: string) {
    if (!confirm("Excluir esta pasta e suas faixas?")) return;
    await registrarEdicao();
    await fetch(`/api/criacao/pastas/${pastaId}`, { method: "DELETE" });
    await load();
  }

  async function setVelocidade(pastaId: string, velocidade: string) {
    await registrarEdicao();
    await fetch(`/api/criacao/pastas/${pastaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ velocidade }),
    });
    await load();
  }

  async function setSelecionavel(pastaId: string, selecionavel: boolean) {
    await registrarEdicao();
    await fetch(`/api/criacao/pastas/${pastaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selecionavel }),
    });
    await load();
  }

  async function removeMusica(pastaId: string, musicaId: string) {
    await registrarEdicao();
    await fetch(`/api/criacao/pastas/${pastaId}/musicas/${musicaId}`, { method: "DELETE" });
    setSelectedByPasta((prev) => {
      const set = prev[pastaId];
      if (!set?.has(musicaId)) return prev;
      const nextSet = new Set(set);
      nextSet.delete(musicaId);
      return { ...prev, [pastaId]: nextSet };
    });
    await load();
  }

  function toggleMusicaSelected(pastaId: string, musicaId: string, checked: boolean) {
    setSelectedByPasta((prev) => {
      const next = new Set(prev[pastaId] ?? []);
      if (checked) next.add(musicaId);
      else next.delete(musicaId);
      return { ...prev, [pastaId]: next };
    });
  }

  function toggleSelectAllPasta(pasta: PastaView) {
    const allIds = pasta.musicas.map((m) => m.id);
    setSelectedByPasta((prev) => {
      const current = prev[pasta.id] ?? new Set<string>();
      const allSelected = allIds.length > 0 && allIds.every((mid) => current.has(mid));
      return { ...prev, [pasta.id]: allSelected ? new Set() : new Set(allIds) };
    });
  }

  async function removeSelectedMusicas(pasta: PastaView) {
    const ids = [...(selectedByPasta[pasta.id] ?? [])];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Remover ${ids.length} faixa${ids.length === 1 ? "" : "s"} da pasta “${pasta.nome}”?`,
      )
    ) {
      return;
    }
    await registrarEdicao();
    await fetch(`/api/criacao/pastas/${pasta.id}/musicas`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicaIds: ids }),
    });
    setSelectedByPasta((prev) => {
      const next = { ...prev };
      delete next[pasta.id];
      return next;
    });
    await load();
  }

  function sortedMusicas(pasta: PastaView): PastaMusicaView[] {
    const key = sortByPasta[pasta.id];
    if (!key) return pasta.musicas;
    return [...pasta.musicas].sort((a, b) => {
      if (key === "titulo") return (a.titulo || "").localeCompare(b.titulo || "", "pt-BR");
      if (key === "artista") return (a.artista || "").localeCompare(b.artista || "", "pt-BR");
      if (key === "addedAt") return (a.addedAt ?? "").localeCompare(b.addedAt ?? "");
      return 0;
    });
  }

  function togglePastaExpand(pastaId: string) {
    setExpandedPastas((prev) => {
      const n = new Set(prev);
      if (n.has(pastaId)) n.delete(pastaId);
      else n.add(pastaId);
      writePersistedPastasAbertas(id, n);
      return n;
    });
  }

  if (loading) return <div className="py-10 text-sm text-slate-500">Carregando…</div>;
  if (error || !prog) return <div className="py-10 text-sm text-red-600">{error ?? "Não encontrada."}</div>;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar para programações
        </button>
        <button
          type="button"
          onClick={() => setShowFechar(true)}
          className={
            "rounded-lg border px-3 py-1.5 text-xs font-semibold transition " +
            (prog.atualizacaoAberta ?
              "border-orange-600 bg-orange-500 text-white hover:bg-orange-600"
            : "border-slate-300 text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400")
          }
        >
          Fechar atualização
        </button>
      </div>

      {showFechar ?
        <FecharAtualizacaoModal
          programacaoId={prog.id}
          programacaoNome={prog.nome}
          clienteRef={prog.clienteRef}
          clienteNome={prog.clienteNome}
          onClose={() => setShowFechar(false)}
          onDone={async () => {
            setShowFechar(false);
            await load();
          }}
        />
      : null}

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
        </div>
      </div>

      {prog.atualizacaoAberta && isAtlCricaAbertura(prog.atualizacaoAbertaPor) ?
        <div className="mb-4">
          <AtlCricaAberturaAviso
            abertaPor={prog.atualizacaoAbertaPor}
            abertaEm={prog.atualizacaoAbertaEm}
            criativoNomeDb={prog.criativoNome}
          />
        </div>
      : null}

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
        <label className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
          <input
            type="checkbox"
            checked={novaPastaSelecionavel}
            onChange={(e) => setNovaPastaSelecionavel(e.target.checked)}
            className="h-4 w-4 rounded border-violet-300 text-violet-700 focus:ring-violet-500"
          />
          Selecionável no player
        </label>
        <button
          type="button"
          onClick={() => void addPasta()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          + Pasta
        </button>
        <button
          type="button"
          onClick={() => setShowEspecial(true)}
          className="rounded-lg border border-violet-400 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-100"
        >
          + Especial
        </button>
      </div>

      {prog.pastas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Crie a primeira pasta (playlist) e adicione faixas da biblioteca.
        </div>
      : <div className="space-y-3">
          {prog.pastas.map((pasta) => {
            const isOpen = expandedPastas.has(pasta.id);
            const selected = selectedByPasta[pasta.id] ?? new Set<string>();
            const selectedCount = selected.size;
            const musicas = sortedMusicas(pasta);
            const allSelected = musicas.length > 0 && musicas.every((m) => selected.has(m.id));
            const someSelected = selectedCount > 0 && !allSelected;
            const currentSort = sortByPasta[pasta.id] ?? null;

            return (
            <div
              key={pasta.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    onClick={() => togglePastaExpand(pasta.id)}
                    className="shrink-0 text-slate-400 hover:text-slate-700"
                    aria-label={isOpen ? "Fechar pasta" : "Abrir pasta"}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  {isOpen && pasta.musicas.length > 0 ?
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={() => toggleSelectAllPasta(pasta)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-950"
                      title={allSelected ? "Desmarcar todas" : "Selecionar todas"}
                      aria-label={`Selecionar todas as faixas de ${pasta.nome}`}
                    />
                  : null}
                  <button
                    type="button"
                    onClick={() => togglePastaExpand(pasta.id)}
                    className="text-sm font-bold text-slate-800 hover:text-slate-600 dark:text-slate-100"
                  >
                    {pasta.nome}
                  </button>
                  {pasta.selecionavel ?
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                      Selecionável
                    </span>
                  : null}
                  <CronogramaAlvoBadges ags={ags} alvoTipo="pasta" alvoId={pasta.id} />
                  <span className="text-xs text-slate-400">
                    {pasta.musicas.length} faixa{pasta.musicas.length === 1 ? "" : "s"}
                    {isOpen && selectedCount > 0 ?
                      ` · ${selectedCount} selecionada${selectedCount === 1 ? "" : "s"}`
                    : null}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isOpen && selectedCount > 0 ?
                    <button
                      type="button"
                      onClick={() => void removeSelectedMusicas(pasta)}
                      className="rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                    >
                      Remover ({selectedCount})
                    </button>
                  : null}
                  {isOpen ?
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
                      className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                      title="Ordenar músicas"
                    >
                      <option value="">Ordem padrão</option>
                      <option value="titulo">Por título</option>
                      <option value="artista">Por artista</option>
                      <option value="addedAt">Por data de entrada</option>
                    </select>
                  : null}
                  <label
                    className="flex items-center gap-1.5 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100"
                    title="Só toca no player quando o operador selecionar na grade"
                  >
                    <input
                      type="checkbox"
                      checked={pasta.selecionavel}
                      onChange={(e) => void setSelecionavel(pasta.id, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-violet-300 text-violet-700 focus:ring-violet-500"
                    />
                    Selecionável
                  </label>
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

              {isOpen ?
                pasta.musicas.length === 0 ?
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    Pasta vazia — clique em “+ Músicas” para adicionar da biblioteca.
                  </div>
                : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {musicas.map((m, idx) => {
                    const isNova = isMusicaNovaNaAtualizacao({
                      musicaId: m.id,
                      addedAt: m.addedAt,
                      atualizacaoAberta: prog.atualizacaoAberta,
                      atualizacaoAbertaEm: prog.atualizacaoAbertaEm,
                      sessionAddedIds,
                    });
                    return (
                    <li
                      key={m.id}
                      className={`flex items-center gap-3 px-4 py-2 text-sm ${
                        isNova ?
                          "border-l-2 border-emerald-500 bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-950/25"
                        : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={(e) => toggleMusicaSelected(pasta.id, m.id, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-950"
                        aria-label={`Selecionar ${m.titulo}`}
                      />
                      {m.previewUrl ?
                        <MusicaPreviewButton
                          track={{
                            id: m.id,
                            titulo: m.titulo,
                            artista: m.artista,
                            previewUrl: m.previewUrl,
                            durationMs: m.durationMs,
                          }}
                        />
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
                      <span
                        className={`shrink-0 text-[11px] tabular-nums ${
                          isNova ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-slate-400"
                        }`}
                        title="Data de entrada nesta pasta"
                      >
                        {formatPastaMusicaAddedAt(m.addedAt)}
                      </span>
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
                    );
                  })}
                </ul>
              : null}
            </div>
            );
          })}
        </div>
      }

      <VinhetasSection programacaoId={id} ags={ags} onEdit={registrarEdicao} />

      <CronogramaSection
        programacaoId={id}
        pastas={prog.pastas.map((p) => ({ id: p.id, nome: p.nome }))}
        ags={ags}
        onAgendamentosChange={setAgs}
        onEdit={registrarEdicao}
        onRefreshTargets={reloadPastasParaCronograma}
      />

      {addTo ?
        <AddMusicasBibliotecaModal
          title={`Adicionar à pasta “${addTo.nome}”`}
          getDisabledReason={(musicaId) => {
            for (const p of prog.pastas) {
              if (p.musicas.some((m) => m.id === musicaId)) {
                return p.id === addTo.id ? "já na pasta" : `já em «${p.nome}»`;
              }
            }
            return null;
          }}
          onClose={() => setAddTo(null)}
          onConfirm={async (musicaIds) => {
            await fetch(`/api/criacao/pastas/${addTo.id}/musicas`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ musicaIds }),
            });
            setSessionAddedIds((prev) => {
              const next = new Set(prev);
              for (const mid of musicaIds) next.add(mid);
              return next;
            });
            await registrarEdicao();
            setAddTo(null);
            await load();
          }}
        />
      : null}

      {showEspecial ?
        <EscolherPastaEspecialModal
          onClose={() => setShowEspecial(false)}
          onSelect={addPastaFromEspecial}
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

function VinhetasSection({
  programacaoId,
  ags,
  onEdit,
}: {
  programacaoId: string;
  ags: AgendamentoRow[];
  onEdit?: () => void | Promise<void>;
}) {
  const [vinhetas, setVinhetas] = useState<Vinheta[]>([]);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [bibOpen, setBibOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadId = useRef<string | null>(null);

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
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), tipo: "audio" }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      setNome("");
      await onEdit?.();
      await load();
      if (data.id) {
        pendingUploadId.current = data.id;
        fileInputRef.current?.click();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Excluir esta vinheta?")) return;
    await onEdit?.();
    await fetch(`/api/criacao/vinhetas/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mt-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pendingUploadId.current;
          pendingUploadId.current = null;
          e.target.value = "";
          if (!file || !id) return;
          void (async () => {
            setBusy(true);
            try {
              await uploadVinhetaAudio(id, file);
              await onEdit?.();
              await load();
            } catch (err) {
              const code = err instanceof Error ? err.message : "upload_falhou";
              alert(vinhetaUploadErrorMessage(code));
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
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
        <button
          type="button"
          onClick={() => setBibOpen(true)}
          className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
        >
          Puxar da biblioteca IA
        </button>
        <button
          type="button"
          onClick={() => void criar()}
          disabled={busy || !nome.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          + Vinheta MP3
        </button>
      </div>

      {bibOpen ?
        <ImportVinhetaBibliotecaModal
          programacaoId={programacaoId}
          onClose={() => setBibOpen(false)}
          onImported={async () => {
            setBibOpen(false);
            await onEdit?.();
            await load();
          }}
        />
      : null}

      {vinhetas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
          Sem vinhetas. Crie uma vinheta e envie o áudio MP3 para atrelar a esta programação.
        </div>
      : <div className="space-y-2">
          {vinhetas.map((v) => (
            <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                    {v.tipo === "ia" ? "IA" : v.tipo === "audio" ? "Áudio" : "TTS legado"}
                  </span>
                  <span className="text-sm font-semibold">{v.nome}</span>
                  <CronogramaAlvoBadges ags={ags} alvoTipo="vinheta" alvoId={v.id} />
                </div>
                <div className="flex items-center gap-2">
                  <VinhetaAudioControls
                    vinhetaId={v.id}
                    tipo={v.tipo}
                    temAudio={v.temAudio}
                    previewUrl={v.previewUrl}
                    onUploaded={async () => {
                      await onEdit?.();
                      await load();
                    }}
                  />
                  <button type="button" onClick={() => void remover(v.id)} className="text-slate-300 hover:text-red-600" title="Excluir">🗑</button>
                </div>
              </div>

              {v.tipo === "tts" ?
                <div className="mt-2 text-xs text-slate-500">Vinheta TTS legada — edição por locução desativada por enquanto.</div>
              : v.temAudio ?
                <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">Áudio enviado — use ▶ para ouvir ou “trocar” para substituir.</div>
              : null}
            </div>
          ))}
        </div>
      }
    </div>
  );
}

function ImportVinhetaBibliotecaModal({
  programacaoId,
  onClose,
  onImported,
}: {
  programacaoId: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Array<{ id: string; nome: string; previewUrl: string | null; temAudio: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/criacao/vinhetas/lab?scope=biblioteca");
        const data = (await res.json()) as {
          vinhetas?: Array<{ id: string; nome: string; previewUrl: string | null; temAudio: boolean }>;
        };
        setRows(data.vinhetas ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function puxar(vinhetaId: string) {
    setBusy(vinhetaId);
    try {
      const res = await fetch(`/api/criacao/vinhetas/lab/${encodeURIComponent(vinhetaId)}/anexar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programacaoId }),
      });
      if (!res.ok) throw new Error();
      await onImported();
    } catch {
      alert("Não foi possível puxar esta vinheta.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-bold">Vinhetas salvas (IA)</h3>
          <p className="text-xs text-slate-500">Criadas em Criação → Vinhetas</p>
        </div>
        <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {loading ?
            <li className="px-4 py-6 text-sm text-slate-500">Carregando…</li>
          : rows.length === 0 ?
            <li className="px-4 py-6 text-sm text-slate-500">Nenhuma vinheta aprovada na biblioteca.</li>
          : rows.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{v.nome}</span>
                <button
                  type="button"
                  disabled={busy === v.id}
                  onClick={() => void puxar(v.id)}
                  className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === v.id ? "…" : "Usar aqui"}
                </button>
              </li>
            ))
          }
        </ul>
        <div className="border-t border-slate-200 px-4 py-3 text-right dark:border-slate-800">
          <button type="button" onClick={onClose} className="text-sm text-slate-500">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

const CRONOGRAMA_HORARIO_PRESETS = [
  { label: "Dia todo", hIni: "00:00", hFim: "23:59" },
  { label: "00:00 – 12:00", hIni: "00:00", hFim: "12:00" },
  { label: "12:00 – 18:00", hIni: "12:00", hFim: "18:00" },
  { label: "18:00 – 23:59", hIni: "18:00", hFim: "23:59" },
] as const;

function CronogramaSection({
  programacaoId,
  pastas,
  ags,
  onAgendamentosChange,
  onEdit,
  onRefreshTargets,
}: {
  programacaoId: string;
  pastas: { id: string; nome: string }[];
  ags: AgendamentoRow[];
  onAgendamentosChange: (next: AgendamentoRow[]) => void;
  onEdit?: () => void | Promise<void>;
  onRefreshTargets?: () => void | Promise<void>;
}) {
  const [vinhetas, setVinhetas] = useState<{ id: string; nome: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [refreshingLista, setRefreshingLista] = useState(false);

  // form
  const [alvo, setAlvo] = useState("");
  const [dias, setDias] = useState<Set<number>>(new Set());
  const [hIni, setHIni] = useState("00:00");
  const [hFim, setHFim] = useState("23:59");
  const [dIni, setDIni] = useState("");
  const [dFim, setDFim] = useState("");
  const [freq, setFreq] = useState("");
  const [freqMusicas, setFreqMusicas] = useState("");
  const [busy, setBusy] = useState(false);
  const [regrasAdicionadas, setRegrasAdicionadas] = useState(0);

  const load = useCallback(async () => {
    try {
      const [ra, rv] = await Promise.all([
        fetch(`/api/criacao/programacoes/${programacaoId}/agendamentos`),
        fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`),
      ]);
      if (ra.ok) {
        onAgendamentosChange(((await ra.json()) as { agendamentos: AgendamentoRow[] }).agendamentos);
      }
      if (rv.ok) setVinhetas(((await rv.json()) as { vinhetas: { id: string; nome: string }[] }).vinhetas);
    } catch {
      /* silencioso */
    }
  }, [programacaoId, onAgendamentosChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function atualizarListaAlvos() {
    setRefreshingLista(true);
    try {
      await onRefreshTargets?.();
      await load();
    } finally {
      setRefreshingLista(false);
    }
  }

  const alvoIsVinheta = alvo.startsWith("vinheta:");

  async function criar() {
    if (!alvo || busy) return;
    const [alvoTipo, alvoId] = alvo.split(":");
    setBusy(true);
    try {
      await onEdit?.();
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
          frequenciaMusicas: alvoTipo === "vinheta" && freqMusicas ? Number(freqMusicas) : undefined,
        }),
      });
      setDias(new Set());
      setDIni("");
      setDFim("");
      setFreq("");
      setFreqMusicas("");
      setRegrasAdicionadas((n) => n + 1);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function fecharFormulario() {
    setOpen(false);
    setRegrasAdicionadas(0);
    setDias(new Set());
    setDIni("");
    setDFim("");
    setFreq("");
    setFreqMusicas("");
  }

  async function remover(id: string) {
    await onEdit?.();
    await fetch(`/api/criacao/agendamentos/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleAtivo(a: AgendamentoRow) {
    await onEdit?.();
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
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">O que toca</span>
                <button
                  type="button"
                  disabled={busy || refreshingLista}
                  onClick={() => void atualizarListaAlvos()}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Buscar pastas e vinhetas recém-criadas nesta programação"
                >
                  {refreshingLista ? "Atualizando…" : "Atualizar"}
                </button>
              </div>
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
              {pastas.length === 0 && vinhetas.length === 0 ?
                <p className="mt-1 text-[10px] text-slate-400">
                  Criou pasta ou vinheta acima? Clique em <strong>Atualizar</strong>.
                </p>
              : null}
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
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CRONOGRAMA_HORARIO_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setHIni(p.hIni);
                      setHFim(p.hFim);
                    }}
                    className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {p.label}
                  </button>
                ))}
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
              <>
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
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Repetir a cada (músicas)</span>
                  <input
                    type="number"
                    min={1}
                    value={freqMusicas}
                    onChange={(e) => setFreqMusicas(e.target.value)}
                    placeholder="ex.: 5"
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              </>
            : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void criar()}
              disabled={busy || !alvo}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {busy ? "Salvando…" : "Adicionar regra"}
            </button>
            {regrasAdicionadas > 0 ?
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                {regrasAdicionadas} regra{regrasAdicionadas === 1 ? "" : "s"} salva{regrasAdicionadas === 1 ? "" : "s"} — pode adicionar mais para a mesma pasta
              </span>
            : null}
            <button
              type="button"
              onClick={fecharFormulario}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              Concluir
            </button>
          </div>
        </div>
      : null}

      {ags.length === 0 ?
        <p className="rounded-xl border border-dashed border-emerald-300/60 bg-emerald-50/50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          Nenhuma regra criada — cada pasta e vinheta mostra <strong>TOCAR SEMPRE</strong> ao lado do nome. Use «+ Regra» para restringir horários.
        </p>
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
                    a cada {a.frequenciaMin} min
                  </span>
                : null}
                {a.frequenciaMusicas ?
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                    a cada {a.frequenciaMusicas} música{a.frequenciaMusicas === 1 ? "" : "s"}
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
