"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Bucket = { pct: number; frase: string; tagId: string | null; tagNome: string | null };
type Interpretacao = {
  total: number;
  bpmMin: number | null;
  bpmMax: number | null;
  excludeRejected: boolean;
  preferLeastUsed: boolean;
  buckets: Bucket[];
};
type Faixa = { id: string; titulo: string; artista: string; bpm: number | null; motivo: string; previewUrl: string | null };
type Resultado = { interpretacao: Interpretacao; faixas: Faixa[]; avisos: string[] };
type Programacao = { id: string; nome: string; clienteNome: string };

const EXEMPLO =
  "40% lounge style lauro, 30% bossa up fernando, 30% brasil cool. Músicas menos usadas em programações ativas. BPM abaixo de 130. Evitar rejeitadas.";

export function WizardPanel() {
  const [instrucao, setInstrucao] = useState("");
  const [total, setTotal] = useState(30);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  // salvar
  const [programacoes, setProgramacoes] = useState<Programacao[]>([]);
  const [progId, setProgId] = useState("");
  const [pastaNome, setPastaNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/criacao/programacoes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.programacoes) setProgramacoes(d.programacoes as Programacao[]);
      })
      .catch(() => {});
  }, []);

  async function gerar() {
    setLoading(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await fetch("/api/criacao/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrucao, total }),
      });
      if (!r.ok) throw new Error();
      const data = (await r.json()) as Resultado;
      setRes(data);
      setFaixas(data.faixas);
    } catch {
      setError("Não foi possível gerar a playlist.");
    } finally {
      setLoading(false);
    }
  }

  function play(f: Faixa) {
    const a = audioRef.current;
    if (!a || !f.previewUrl) return;
    if (playing === f.id) {
      a.pause();
      return;
    }
    a.src = f.previewUrl;
    a.play().then(() => setPlaying(f.id), () => setPlaying(null));
  }

  const remove = useCallback((id: string) => {
    setFaixas((prev) => prev.filter((f) => f.id !== id));
  }, []);

  async function salvar() {
    if (!progId || !pastaNome.trim() || faixas.length === 0 || saving) return;
    setSaving(true);
    setOkMsg(null);
    try {
      const rp = await fetch(`/api/criacao/programacoes/${progId}/pastas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: pastaNome.trim() }),
      });
      if (!rp.ok) throw new Error();
      const { id: pastaId } = (await rp.json()) as { id: string };
      await fetch(`/api/criacao/pastas/${pastaId}/musicas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicaIds: faixas.map((f) => f.id) }),
      });
      setOkMsg(`Pasta "${pastaNome.trim()}" criada com ${faixas.length} faixas.`);
      setPastaNome("");
    } catch {
      setError("Não foi possível salvar a pasta.");
    } finally {
      setSaving(false);
    }
  }

  const interp = res?.interpretacao;

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-6 sm:px-4">
      <audio ref={audioRef} onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} className="hidden" />

      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Wizard IA</div>
        <h1 className="text-2xl font-bold tracking-tight">Wizard de programação</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Descreva a playlist em linguagem natural. O algoritmo lê a biblioteca e as tags criativas,
          monta uma base por percentuais, BPM e uso, e você ajusta antes de salvar como pasta.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <textarea
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          rows={3}
          placeholder={EXEMPLO}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setInstrucao(EXEMPLO)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            usar exemplo
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold text-slate-500">Total de faixas</span>
            <input
              type="number"
              min={1}
              max={200}
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button
            type="button"
            onClick={() => void gerar()}
            disabled={loading || !instrucao.trim()}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {loading ? "Gerando…" : "✨ Gerar playlist"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      {interp ?
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {interp.buckets.map((b, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-1 font-semibold ${b.tagNome ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}
            >
              {b.pct}% {b.tagNome ?? b.frase}
            </span>
          ))}
          {interp.bpmMax != null ? <Chip>BPM ≤ {interp.bpmMax}</Chip> : null}
          {interp.bpmMin != null ? <Chip>BPM ≥ {interp.bpmMin}</Chip> : null}
          {interp.excludeRejected ? <Chip>evitar rejeitadas</Chip> : null}
          {interp.preferLeastUsed ? <Chip>menos usadas</Chip> : null}
        </div>
      : null}

      {res?.avisos.length ?
        <div className="mt-3 space-y-1">
          {res.avisos.map((a, i) => (
            <div key={i} className="text-xs text-amber-700 dark:text-amber-300">⚠ {a}</div>
          ))}
        </div>
      : null}

      {faixas.length > 0 ?
        <>
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800">
              <span>{faixas.length} faixas sugeridas</span>
              <span>ajuste antes de salvar</span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {faixas.map((f, idx) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{idx + 1}</span>
                  {f.previewUrl ?
                    <button
                      type="button"
                      onClick={() => play(f)}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs ${playing === f.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
                    >
                      {playing === f.id ? "⏸" : "▶"}
                    </button>
                  : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-300 dark:bg-slate-800">🎵</span>
                  }
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-100">{f.titulo || "(sem título)"}</div>
                    <div className="truncate text-xs text-slate-500">{f.artista || "—"}</div>
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{f.motivo}</span>
                  {f.bpm ? <span className="shrink-0 text-xs tabular-nums text-slate-400">{f.bpm} bpm</span> : null}
                  <button type="button" onClick={() => remove(f.id)} className="shrink-0 text-slate-300 hover:text-red-600" title="Remover">✕</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Programação</span>
              <select
                value={progId}
                onChange={(e) => setProgId(e.target.value)}
                className="min-w-[240px] rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Selecione…</option>
                {programacoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.clienteNome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Nome da pasta</span>
              <input
                value={pastaNome}
                onChange={(e) => setPastaNome(e.target.value)}
                placeholder="Ex.: Lounge IA"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving || !progId || !pastaNome.trim()}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? "Salvando…" : "Salvar como pasta"}
            </button>
            {okMsg ? <span className="text-sm text-emerald-600">{okMsg}</span> : null}
          </div>
        </>
      : null}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </span>
  );
}
