"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { VinhetaAudioControls } from "@/components/criacao/VinhetaAudioControls";
import type { VinhetaLabRow } from "@/lib/criacao/vinhetaLabService";

type Voice = { voice_id: string; name: string; category?: string };
type BibRow = { id: string; titulo: string; artista: string; previewUrl: string | null };

export function VinhetasPanel() {
  const [configured, setConfigured] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [vinhetas, setVinhetas] = useState<VinhetaLabRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");

  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [vozId, setVozId] = useState("");
  const [trilha, setTrilha] = useState<BibRow | null>(null);
  const [trilhaBusca, setTrilhaBusca] = useState("");
  const [trilhas, setTrilhas] = useState<BibRow[]>([]);
  const [loadingTrilhas, setLoadingTrilhas] = useState(false);
  const [ativo, setAtivo] = useState<VinhetaLabRow | null>(null);
  const [busy, setBusy] = useState(false);

  const vozNome = useMemo(() => voices.find((v) => v.voice_id === vozId)?.name ?? "", [voices, vozId]);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/criacao/vinhetas/elevenlabs/config");
    const data = (await res.json()) as { configured?: boolean };
    setConfigured(Boolean(data.configured));
  }, []);

  const loadVoices = useCallback(async () => {
    setLoadingVoices(true);
    try {
      const res = await fetch("/api/criacao/vinhetas/elevenlabs/voices");
      const data = (await res.json()) as { configured?: boolean; voices?: Voice[]; error?: string };
      setConfigured(Boolean(data.configured));
      setVoices(data.voices ?? []);
      if (data.voices?.[0] && !vozId) setVozId(data.voices[0].voice_id);
    } catch {
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }, [vozId]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/criacao/vinhetas/lab");
      const data = (await res.json()) as { vinhetas?: VinhetaLabRow[] };
      setVinhetas(data.vinhetas ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadVoices();
    void loadList();
  }, [loadConfig, loadVoices, loadList]);

  async function saveApiKey() {
    setSavingKey(true);
    setMsg("");
    try {
      const res = await fetch("/api/criacao/vinhetas/elevenlabs/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyDraft }),
      });
      if (!res.ok) throw new Error("Falha ao salvar chave.");
      setApiKeyDraft("");
      await loadConfig();
      await loadVoices();
      setMsg("Conta ElevenLabs conectada.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSavingKey(false);
    }
  }

  async function buscarTrilhas() {
    setLoadingTrilhas(true);
    try {
      const params = new URLSearchParams({ pageSize: "40", status: "pronta" });
      if (trilhaBusca.trim()) params.set("search", trilhaBusca.trim());
      const res = await fetch(`/api/criacao/biblioteca?${params.toString()}`);
      const data = (await res.json()) as { musicas: BibRow[] };
      setTrilhas(data.musicas ?? []);
    } catch {
      setTrilhas([]);
    } finally {
      setLoadingTrilhas(false);
    }
  }

  async function criarRascunho() {
    if (!nome.trim() || !texto.trim() || !vozId || !trilha) {
      setMsg("Preencha nome, texto, voz e trilha.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/criacao/vinhetas/lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          texto: texto.trim(),
          voz: vozId,
          vozNome,
          trilhaMusicaId: trilha.id,
        }),
      });
      const data = (await res.json()) as { vinheta?: VinhetaLabRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "erro");
      setAtivo(data.vinheta ?? null);
      setNome("");
      setTexto("");
      await loadList();
      setMsg("Rascunho criado — clique em Gerar para ouvir a edição.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao criar.");
    } finally {
      setBusy(false);
    }
  }

  async function gerar(id: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/criacao/vinhetas/lab/${encodeURIComponent(id)}/generate`, {
        method: "POST",
      });
      const data = (await res.json()) as { vinheta?: VinhetaLabRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "geracao_falhou");
      if (data.vinheta) setAtivo(data.vinheta);
      await loadList();
      setMsg("Edição pronta — ouça e aprove para salvar na biblioteca.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  async function aprovar(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/criacao/vinhetas/lab/${encodeURIComponent(id)}/aprovar`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("aprovar_falhou");
      await loadList();
      setMsg("Vinheta salva — disponível em Programações → Puxar da biblioteca.");
    } catch {
      setMsg("Não foi possível aprovar.");
    } finally {
      setBusy(false);
    }
  }

  const salvas = vinhetas.filter((v) => v.status === "aprovada");
  const rascunhos = vinhetas.filter((v) => v.status !== "aprovada");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Vinhetas IA</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Locução ElevenLabs + trilha ambiente da biblioteca. Aprove aqui e puxe depois nas programações.
        </p>
      </section>

      {msg ?
        <p className="text-sm text-slate-700 dark:text-slate-300">{msg}</p>
      : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Conta ElevenLabs</h2>
        <p className="mt-1 text-xs text-slate-500">
          {configured ?
            "Conectada — vozes da sua conta disponíveis abaixo."
          : "Cole sua API key (elevenlabs.io → Profile → API Keys) ou configure ELEVENLABS_API_KEY no servidor."}
        </p>
        {!configured ?
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="sk_…"
              className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              disabled={savingKey || apiKeyDraft.length < 16}
              onClick={() => void saveApiKey()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingKey ? "Salvando…" : "Conectar"}
            </button>
          </div>
        : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-sm font-bold">Nova vinheta</h2>
          <div className="mt-3 space-y-3">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome (ex.: Promo verão)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder="Texto da locução…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <label className="block text-xs font-semibold text-slate-500">Voz ElevenLabs</label>
            {loadingVoices ?
              <p className="text-xs text-slate-400">Carregando vozes…</p>
            : <select
                value={vozId}
                onChange={(e) => setVozId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name}
                    {v.category ? ` (${v.category})` : ""}
                  </option>
                ))}
              </select>
            }
            <div>
              <label className="text-xs font-semibold text-slate-500">Trilha ambiente</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={trilhaBusca}
                  onChange={(e) => setTrilhaBusca(e.target.value)}
                  placeholder="Buscar na biblioteca…"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <button type="button" onClick={() => void buscarTrilhas()} className="rounded-lg border px-3 text-xs font-semibold dark:border-slate-600">
                  Buscar
                </button>
              </div>
              {trilha ?
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                  ✓ {trilha.artista} — {trilha.titulo}
                </p>
              : null}
              {loadingTrilhas ?
                <p className="mt-2 text-xs text-slate-400">Buscando…</p>
              : trilhas.length > 0 ?
                <ul className="mt-2 max-h-32 overflow-y-auto divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {trilhas.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-1">
                      <button type="button" className="flex-1 text-left hover:text-amber-700" onClick={() => setTrilha(m)}>
                        {m.artista} — {m.titulo}
                      </button>
                      {m.previewUrl ?
                        <MusicaPreviewButton track={{ id: m.id, titulo: m.titulo, artista: m.artista, previewUrl: m.previewUrl, durationMs: null }} />
                      : null}
                    </li>
                  ))}
                </ul>
              : null}
            </div>
            <button
              type="button"
              disabled={busy || !configured}
              onClick={() => void criarRascunho()}
              className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Criar rascunho
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-sm font-bold">Preview / aprovação</h2>
          {ativo ?
            <div className="mt-3 space-y-3">
              <p className="font-semibold">{ativo.nome}</p>
              <p className="text-xs text-slate-500">Status: {ativo.status} · Voz: {ativo.vozNome || ativo.voz}</p>
              {ativo.trilhaTitulo ?
                <p className="text-xs text-slate-500">
                  Trilha: {ativo.trilhaArtista} — {ativo.trilhaTitulo}
                </p>
              : null}
              <VinhetaAudioControls
                vinhetaId={ativo.id}
                tipo="ia"
                temAudio={ativo.temAudio}
                previewUrl={ativo.previewUrl}
                onUploaded={() => void loadList()}
              />
              <div className="flex flex-wrap gap-2">
                {ativo.status !== "preview" && ativo.status !== "aprovada" ?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void gerar(ativo.id)}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {busy ? "Gerando…" : "Gerar edição"}
                  </button>
                : null}
                {ativo.status === "preview" ?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void aprovar(ativo.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Aprovar e salvar
                  </button>
                : null}
              </div>
            </div>
          : <p className="mt-3 text-sm text-slate-500">Selecione ou crie uma vinheta à esquerda.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-bold">Biblioteca salva ({salvas.length})</h2>
        {loadingList ?
          <p className="mt-2 text-sm text-slate-500">Carregando…</p>
        : salvas.length === 0 ?
          <p className="mt-2 text-sm text-slate-500">Nenhuma vinheta aprovada ainda.</p>
        : <ul className="mt-3 space-y-2">
            {salvas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span className="font-medium">{v.nome}</span>
                <div className="flex items-center gap-2">
                  <VinhetaAudioControls vinhetaId={v.id} tipo="ia" temAudio={v.temAudio} previewUrl={v.previewUrl} onUploaded={() => void loadList()} />
                  <button type="button" className="text-xs text-violet-600" onClick={() => setAtivo(v)}>
                    Abrir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        }
        {rascunhos.length > 0 ?
          <>
            <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Rascunhos</h3>
            <ul className="mt-2 space-y-1 text-xs">
              {rascunhos.map((v) => (
                <li key={v.id}>
                  <button type="button" className="text-violet-600 hover:underline" onClick={() => setAtivo(v)}>
                    {v.nome} ({v.status})
                  </button>
                </li>
              ))}
            </ul>
          </>
        : null}
      </section>
    </div>
  );
}
