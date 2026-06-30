"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { VinhetaAudioControls } from "@/components/criacao/VinhetaAudioControls";
import type { VinhetaLabRow, VinhetaLabTweakAction } from "@/lib/criacao/vinhetaLabService";
import { formatVinhetaIaSpeed, formatVinhetaIaStability } from "@/lib/criacao/vinhetaIaDefaults";

type Voice = { voice_id: string; name: string; category?: string };
type TrilhaRow = {
  id: string;
  nome: string;
  previewUrl: string | null;
  temAudio: boolean;
};
type PresetVoice = { voiceId: string; label: string };
type ElevenLabsSource = "server" | "user" | "none";

export function VinhetasPanel() {
  const [configured, setConfigured] = useState(false);
  const [elevenSource, setElevenSource] = useState<ElevenLabsSource>("none");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState("");
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [vinhetas, setVinhetas] = useState<VinhetaLabRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");

  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [vozId, setVozId] = useState("");
  const [trilha, setTrilha] = useState<TrilhaRow | null>(null);
  const [trilhasVinheta, setTrilhasVinheta] = useState<TrilhaRow[]>([]);
  const [loadingTrilhas, setLoadingTrilhas] = useState(true);
  const [trilhaUploadNome, setTrilhaUploadNome] = useState("");
  const [trilhaUploadFile, setTrilhaUploadFile] = useState<File | null>(null);
  const [uploadingTrilha, setUploadingTrilha] = useState(false);
  const [ativo, setAtivo] = useState<VinhetaLabRow | null>(null);
  const [busy, setBusy] = useState(false);

  const [isMaster, setIsMaster] = useState(false);
  const [adminVoices, setAdminVoices] = useState<PresetVoice[]>([]);
  const [adminVoiceId, setAdminVoiceId] = useState("");
  const [adminVoiceLabel, setAdminVoiceLabel] = useState("");
  const [savingCatalog, setSavingCatalog] = useState(false);

  const vozNome = useMemo(() => voices.find((v) => v.voice_id === vozId)?.name ?? "", [voices, vozId]);

  function abrirVinheta(v: VinhetaLabRow) {
    setAtivo(v);
    setNome(v.nome);
    setTexto(v.texto);
    setVozId(v.voz);
    if (v.trilhaVinhetaId) {
      const t = trilhasVinheta.find((x) => x.id === v.trilhaVinhetaId);
      if (t) setTrilha(t);
    }
  }

  function draftPayload() {
    return {
      nome: nome.trim(),
      texto: texto.trim(),
      voz: vozId,
      vozNome,
      trilhaVinhetaId: trilha?.id ?? null,
    };
  }

  useEffect(() => {
    if (!ativo) return;
    setNome(ativo.nome);
    setTexto(ativo.texto);
    setVozId(ativo.voz);
  }, [ativo?.id, ativo?.nome, ativo?.texto, ativo?.voz]);

  const loadTrilhasVinheta = useCallback(async () => {
    setLoadingTrilhas(true);
    try {
      const res = await fetch("/api/criacao/vinhetas/trilhas");
      const data = (await res.json()) as { trilhas?: TrilhaRow[] };
      const list = (data.trilhas ?? []).filter((t) => t.temAudio);
      setTrilhasVinheta(list);
      if (list[0]) setTrilha((prev) => prev ?? list[0]);
    } catch {
      setTrilhasVinheta([]);
    } finally {
      setLoadingTrilhas(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoadingVoices(true);
    try {
      const res = await fetch("/api/criacao/vinhetas/catalog");
      const data = (await res.json()) as {
        presetVoices?: PresetVoice[];
        elevenLabs?: { configured?: boolean; source?: ElevenLabsSource };
        canEdit?: boolean;
      };
      const el = data.elevenLabs;
      setConfigured(Boolean(el?.configured));
      setElevenSource(el?.source ?? "none");
      setIsMaster(Boolean(data.canEdit));
      setAdminVoices(data.presetVoices ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  const loadVoices = useCallback(async () => {
    setLoadingVoices(true);
    setVoicesError("");
    try {
      const res = await fetch("/api/criacao/vinhetas/elevenlabs/voices");
      const data = (await res.json()) as {
        configured?: boolean;
        voices?: Voice[];
        error?: string | null;
        presetOnly?: boolean;
      };
      setConfigured(Boolean(data.configured));
      const list = data.voices ?? [];
      setVoices(list);
      if (data.error && list.length === 0) {
        setVoicesError(
          data.error.includes("401") || data.error.includes("403") ?
            "Chave ElevenLabs inválida ou sem permissão — confira ELEVENLABS_API_KEY no Netlify."
          : "Não foi possível listar vozes. Cadastre vozes fixas abaixo (master) ou em VINHETA_IA_VOZES.",
        );
      } else if (list.length === 0 && data.configured) {
        setVoicesError("Nenhuma voz disponível — cadastre IDs fixos em Catálogo fixo ou VINHETA_IA_VOZES.");
      }
      if (list[0]) setVozId((prev) => prev || list[0].voice_id);
    } catch {
      setVoices([]);
      setVoicesError("Erro ao carregar vozes.");
    } finally {
      setLoadingVoices(false);
    }
  }, []);

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
    void loadCatalog();
    void loadVoices();
    void loadList();
    void loadTrilhasVinheta();
  }, [loadCatalog, loadVoices, loadList, loadTrilhasVinheta]);

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
      await loadVoices();
      setMsg("Conta ElevenLabs conectada.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSavingKey(false);
    }
  }

  async function salvarCatalogo() {
    setSavingCatalog(true);
    setMsg("");
    try {
      const res = await fetch("/api/criacao/vinhetas/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voices: adminVoices, trilhas: [] }),
      });
      if (!res.ok) throw new Error("Falha ao salvar catálogo.");
      await loadCatalog();
      await loadVoices();
      setMsg("Vozes fixas salvas.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar catálogo.");
    } finally {
      setSavingCatalog(false);
    }
  }

  async function enviarTrilha() {
    if (!trilhaUploadNome.trim() || !trilhaUploadFile) {
      setMsg("Informe nome e arquivo MP3 da trilha.");
      return;
    }
    setUploadingTrilha(true);
    setMsg("");
    try {
      const createRes = await fetch("/api/criacao/vinhetas/trilhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: trilhaUploadNome.trim() }),
      });
      const created = (await createRes.json()) as {
        trilha?: TrilhaRow;
        ingestUrl?: string;
        token?: string;
        error?: string;
      };
      if (!createRes.ok || !created.trilha || !created.ingestUrl || !created.token) {
        throw new Error(created.error ?? "Falha ao criar trilha.");
      }
      const fd = new FormData();
      fd.append("token", created.token);
      fd.append("file", trilhaUploadFile);
      const up = await fetch(created.ingestUrl, { method: "POST", body: fd });
      if (!up.ok) {
        const detail = up.status === 404 ?
          "O cloud2 ainda não tem a rota de upload de trilhas — peça redeploy do portal-ibiza (Envyron)."
        : `Upload da trilha falhou no servidor (HTTP ${up.status}).`;
        throw new Error(detail);
      }
      setTrilhaUploadNome("");
      setTrilhaUploadFile(null);
      const listRes = await fetch("/api/criacao/vinhetas/trilhas");
      const listData = (await listRes.json()) as { trilhas?: TrilhaRow[] };
      const list = (listData.trilhas ?? []).filter((t) => t.temAudio);
      setTrilhasVinheta(list);
      const hit = list.find((t) => t.id === created.trilha!.id);
      if (hit) setTrilha(hit);
      setMsg(`Trilha «${created.trilha.nome}» salva — disponível só em Vinhetas.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao enviar trilha.");
    } finally {
      setUploadingTrilha(false);
    }
  }

  async function apagarTrilha(id: string) {
    if (!window.confirm("Apagar esta trilha ambiente?")) return;
    try {
      const res = await fetch(`/api/criacao/vinhetas/trilhas/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("trilha_em_uso");
      if (trilha?.id === id) setTrilha(null);
      await loadTrilhasVinheta();
      setMsg("Trilha removida.");
    } catch {
      setMsg("Não foi possível apagar — trilha pode estar em uso numa vinheta.");
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
          trilhaVinhetaId: trilha.id,
        }),
      });
      const data = (await res.json()) as { vinheta?: VinhetaLabRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "erro");
      if (data.vinheta) abrirVinheta(data.vinheta);
      await loadList();
      setMsg("Rascunho criado — clique em Gerar para ouvir a edição.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao criar.");
    } finally {
      setBusy(false);
    }
  }

  async function gerar(id: string, withDraft = true) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/criacao/vinhetas/lab/${encodeURIComponent(id)}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withDraft ? draftPayload() : {}),
      });
      const data = (await res.json()) as { vinheta?: VinhetaLabRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "geracao_falhou");
      if (data.vinheta) abrirVinheta(data.vinheta);
      await loadList();
      setMsg("Edição pronta — ouça, ajuste e regenere até aprovar.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  async function aplicarTweak(id: string, action: VinhetaLabTweakAction) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/criacao/vinhetas/lab/${encodeURIComponent(id)}/tweak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...draftPayload() }),
      });
      const data = (await res.json()) as { vinheta?: VinhetaLabRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "tweak_falhou");
      if (data.vinheta) abrirVinheta(data.vinheta);
      await loadList();
      setMsg("Edição atualizada — ouça de novo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao ajustar.");
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
          Locução ElevenLabs + trilha ambiente própria (upload aqui). Aprove e puxe depois nas programações.
        </p>
      </section>

      {msg ?
        <p className="text-sm text-slate-700 dark:text-slate-300">{msg}</p>
      : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Conta ElevenLabs</h2>
        {configured ?
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            {elevenSource === "server" ?
              "Conectada automaticamente via Netlify (ELEVENLABS_API_KEY)."
            : "Conectada com sua chave pessoal."}
          </p>
        : <p className="mt-1 text-xs text-slate-500">
            Cole sua API key (elevenlabs.io → Profile → API Keys) ou configure ELEVENLABS_API_KEY no Netlify.
          </p>
        }
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

      {isMaster ?
        <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
          <h2 className="text-sm font-bold text-violet-900 dark:text-violet-200">Vozes fixas (admin)</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            IDs de voz do painel ElevenLabs (Voice Library). Trilhas ambiente são enviadas abaixo — não entram na biblioteca musical.
          </p>
          <p className="mt-3 text-xs font-semibold text-slate-500">Vozes ({adminVoices.length})</p>
          <ul className="mt-2 space-y-1 text-xs">
            {adminVoices.map((v) => (
              <li key={v.voiceId} className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1 dark:bg-slate-900/80">
                <span>
                  {v.label} <span className="text-slate-400">({v.voiceId.slice(0, 8)}…)</span>
                </span>
                <button
                  type="button"
                  className="text-red-600"
                  onClick={() => setAdminVoices((prev) => prev.filter((x) => x.voiceId !== v.voiceId))}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={adminVoiceId}
              onChange={(e) => setAdminVoiceId(e.target.value)}
              placeholder="voice_id ElevenLabs"
              className="min-w-[140px] flex-1 rounded border px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
            />
            <input
              value={adminVoiceLabel}
              onChange={(e) => setAdminVoiceLabel(e.target.value)}
              placeholder="Nome exibido"
              className="min-w-[100px] flex-1 rounded border px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
            />
            <button
              type="button"
              disabled={adminVoiceId.trim().length < 8}
              onClick={() => {
                const voiceId = adminVoiceId.trim();
                const label = adminVoiceLabel.trim() || voiceId;
                setAdminVoices((prev) =>
                  prev.some((x) => x.voiceId === voiceId) ? prev : [...prev, { voiceId, label }],
                );
                setAdminVoiceId("");
                setAdminVoiceLabel("");
              }}
              className="rounded border px-2 py-1 text-xs font-semibold dark:border-slate-600"
            >
              + Voz
            </button>
          </div>
          <button
            type="button"
            disabled={savingCatalog}
            onClick={() => void salvarCatalogo()}
            className="mt-4 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {savingCatalog ? "Salvando…" : "Salvar vozes fixas"}
          </button>
        </section>
      : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Trilhas ambiente (só Vinhetas)</h2>
        <p className="mt-1 text-xs text-slate-500">
          MP3 de fundo para mixar com a locução. Ficam gravadas aqui — não aparecem na biblioteca musical.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={trilhaUploadNome}
            onChange={(e) => setTrilhaUploadNome(e.target.value)}
            placeholder="Nome (ex.: Jazz suave 1)"
            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={(e) => setTrilhaUploadFile(e.target.files?.[0] ?? null)}
            className="max-w-[220px] text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 dark:file:bg-slate-800"
          />
          <button
            type="button"
            disabled={uploadingTrilha || !trilhaUploadNome.trim() || !trilhaUploadFile}
            onClick={() => void enviarTrilha()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {uploadingTrilha ? "Enviando…" : "Subir trilha"}
          </button>
        </div>
        {loadingTrilhas ?
          <p className="mt-3 text-xs text-slate-400">Carregando trilhas…</p>
        : trilhasVinheta.length === 0 ?
          <p className="mt-3 text-xs text-slate-500">Nenhuma trilha ainda — suba MP3 acima.</p>
        : <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {trilhasVinheta.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/80">
                <button
                  type="button"
                  className={`flex-1 text-left ${trilha?.id === t.id ? "font-semibold text-emerald-700" : ""}`}
                  onClick={() => setTrilha(t)}
                >
                  {t.nome}
                </button>
                {t.previewUrl ?
                  <MusicaPreviewButton
                    track={{ id: t.id, titulo: t.nome, artista: "Trilha", previewUrl: t.previewUrl, durationMs: null }}
                  />
                : null}
                <button type="button" className="text-xs text-red-600" onClick={() => void apagarTrilha(t.id)}>
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        }
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
            : voices.length === 0 ?
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {voicesError || "Nenhuma voz cadastrada — peça ao admin configurar o catálogo fixo."}
              </p>
            : <select
                value={vozId}
                onChange={(e) => setVozId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name}
                    {v.category && v.category !== "preset" ? ` (${v.category})` : ""}
                  </option>
                ))}
              </select>
            }
            {voicesError && voices.length > 0 ?
              <p className="text-xs text-amber-600">{voicesError}</p>
            : null}
            <div>
              <label className="text-xs font-semibold text-slate-500">Trilha selecionada</label>
              {trilha ?
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">✓ {trilha.nome}</p>
              : <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Escolha uma trilha na seção acima (ou suba uma nova).
                </p>
              }
            </div>
            <button
              type="button"
              disabled={busy || !configured || !vozId || !trilha}
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
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                disabled={ativo.status === "aprovada"}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 disabled:opacity-60"
              />
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                disabled={ativo.status === "aprovada"}
                placeholder="Texto da locução…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 disabled:opacity-60"
              />
              <p className="text-xs text-slate-500">
                Status: {ativo.status} · Voz: {ativo.vozNome || ativo.voz}
                {ativo.trilhaTitulo ? ` · Trilha: ${ativo.trilhaTitulo}` : ""}
              </p>
              {ativo.status !== "aprovada" ?
                <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-[11px] text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
                  <div className="font-semibold">Parâmetros da última edição</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>Velocidade voz: {formatVinhetaIaSpeed(ativo.iaVoiceSpeed)}</span>
                    <span>Estabilidade: {formatVinhetaIaStability(ativo.iaVoiceStability)}</span>
                    <span>Trilha: {Math.round(ativo.iaBedVolume * 100)}%</span>
                  </div>
                </div>
              : null}
              {!ativo.temAudio && ativo.status !== "gerando" ?
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Ainda sem áudio — clique em <strong>Gerar edição</strong> para criar a locução com trilha.
                </p>
              : null}
              <VinhetaAudioControls
                vinhetaId={ativo.id}
                tipo="ia"
                temAudio={ativo.temAudio}
                previewUrl={ativo.previewUrl}
                onUploaded={() => void loadList()}
              />
              {ativo.status !== "aprovada" ?
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !texto.trim() || !vozId}
                      onClick={() => void gerar(ativo.id)}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Gerando…" : ativo.temAudio ? "Regenerar edição" : "Gerar edição"}
                    </button>
                    {ativo.status === "preview" || ativo.temAudio ?
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void aprovar(ativo.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Aprovar e salvar
                      </button>
                    : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Ajustes rápidos (regenera automaticamente)
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || !ativo.temAudio}
                        onClick={() => void aplicarTweak(ativo.id, "bed_lower")}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        Música mais baixa (−10%)
                      </button>
                      <button
                        type="button"
                        disabled={busy || !ativo.temAudio || ativo.iaVoiceSpeed <= 0.5}
                        onClick={() => void aplicarTweak(ativo.id, "speed_down")}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        Ralentar voz (−0,10)
                      </button>
                      <button
                        type="button"
                        disabled={busy || !ativo.temAudio}
                        onClick={() => void aplicarTweak(ativo.id, "stability_more")}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        Mais estabilidade (50%)
                      </button>
                      <button
                        type="button"
                        disabled={busy || !ativo.temAudio}
                        onClick={() => void aplicarTweak(ativo.id, "stability_less")}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        Menos estabilidade (31%)
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500">
                      Altere o texto acima e use <strong>Regenerar edição</strong>, ou aplique um ajuste rápido.
                    </p>
                  </div>
                </>
              : null}
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
                  <button type="button" className="text-xs text-violet-600" onClick={() => abrirVinheta(v)}>
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
            <ul className="mt-2 space-y-2">
              {rascunhos.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{v.nome}</span>
                    <span className="ml-2 text-[10px] uppercase text-slate-400">{v.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <VinhetaAudioControls
                      vinhetaId={v.id}
                      tipo="ia"
                      temAudio={v.temAudio}
                      previewUrl={v.previewUrl}
                      compact
                      onUploaded={() => void loadList()}
                    />
                    <button
                      type="button"
                      className="text-xs font-semibold text-violet-600 hover:underline"
                      onClick={() => abrirVinheta(v)}
                    >
                      Abrir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">
              Rascunho novo: clique em <strong>Abrir</strong> → <strong>Gerar edição</strong> → ouça com ▶ →{" "}
              <strong>Aprovar e salvar</strong>.
            </p>
          </>
        : null}
      </section>
    </div>
  );
}
