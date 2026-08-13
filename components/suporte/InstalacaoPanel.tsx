"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InstalacaoClientePanel } from "@/components/suporte/InstalacaoClientePanel";
import type { PlayerAvisoPdvTarget } from "@/lib/suporte/playerAvisoPdvSearch";
import {
  INSTALACAO_TIPOS,
  instalacaoTipoLabel,
  type ElectronAuthModo,
} from "@/lib/suporte/instalacaoTipos";
import type { InstalacaoTipo } from "@/lib/suporte/instalacaoService";
import { destinatarioEmailsValid } from "@/lib/suporte/parseDestinatarioEmails";

type Status = { kind: "ok" | "err"; text: string } | null;

type TargetScope = "pdv" | "cliente";

type SelectedClient = {
  portalClienteId: number;
  clienteNome: string;
};

type SelectedPdv = {
  portalClienteId: number;
  portalPdvId: number;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
};

type Contexto = {
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  contatoLojaNome: string;
  contatoLojaEmail: string;
  contatoLojaTelefone: string;
  playerInstaladoEm: string | null;
  podeGerarCodigoPlay: boolean;
};

type LogRow = {
  id: string;
  tipo: string;
  plataforma: string;
  canal: string;
  destinoEmail: string;
  enviadoPor: string;
  createdAt: string;
};

type Tipo = InstalacaoTipo;
type Plataforma = "windows" | "mobile";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/40";

const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=br.com.radioibiza.player5.twa&pcampaignid=web_share";

function mapErr(data: unknown): string {
  const err = (data as { error?: unknown })?.error;
  if (err === "unauthorized") return "Sessão expirada. Entre novamente no portal.";
  if (err === "cliente_pdv_invalido") return "Selecione um PDV válido.";
  if (err === "cliente_sem_pdvs") return "Este cliente não tem PDVs com ID Player.";
  if (err === "pdv_nao_encontrado") return "PDV não encontrado (sem ID Player?).";
  if (err === "tipo_plataforma_invalido") return "Escolha o tipo e a plataforma.";
  if (err === "email_invalido") return "E-mail de destino inválido.";
  if (err === "pdv_com_player_instalado") {
    return "PDV com player instalado. Regenerar a chave serial no Suporte antes de gerar código Play.";
  }
  if (err === "smtp_nao_configurado") return "SMTP não configurado no ambiente (OC_EMAIL_SMTP_*).";
  if (err === "envio_falhou") {
    const detail = (data as { detail?: unknown })?.detail;
    return typeof detail === "string" && detail.trim()
      ? `Falha ao enviar e-mail: ${detail.trim()}`
      : "Falha ao enviar e-mail (SMTP). Tente de novo ou avise o suporte.";
  }
  if (err === "server_error") {
    const detail = (data as { detail?: unknown })?.detail;
    return typeof detail === "string" && detail.trim()
      ? `Erro no servidor: ${detail.trim()}`
      : "Erro no servidor ao enviar. Tente de novo.";
  }
  if (typeof err === "string" && err.trim()) return err;
  return "Operação falhou.";
}

async function postInstalacao(body: Record<string, unknown>) {
  const res = await fetch("/api/suporte/instalacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

function PdvPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: SelectedPdv | null;
  onSelect: (t: SelectedPdv | null) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerAvisoPdvTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/suporte/player-avisos/pdv-search?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const targets = (data as { targets?: PlayerAvisoPdvTarget[] })?.targets;
          setResults(Array.isArray(targets) ? targets : []);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div ref={wrapRef} className="space-y-2">
      {selected ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-emerald-100">{selected.clienteNome}</p>
            <p className="text-zinc-300">{selected.pdvNome}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              Cliente {selected.portalClienteId} · PDV {selected.codigoDisplay}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(null)}
            className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            Trocar
          </button>
        </div>
      ) : null}

      <label className="block text-xs text-zinc-500">
        Buscar por nome do cliente ou PDV
        <input
          type="search"
          value={query}
          disabled={disabled || selected != null}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Ex.: Hering, shopping, 316.001…"
          className={inputClass + " mt-1"}
        />
      </label>

      {open && !selected && query.trim().length >= 2 ? (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-lg">
          {searching ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Nenhum resultado com ID Player.</p>
          ) : (
            results.map((t) => (
              <button
                key={t.portalPdvId}
                type="button"
                className="block w-full border-b border-zinc-800 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-900"
                onClick={() => {
                  onSelect({
                    portalClienteId: t.portalClienteId,
                    portalPdvId: t.portalPdvId,
                    clienteNome: t.clienteNome,
                    pdvNome: t.pdvNome,
                    codigoDisplay: t.codigoDisplay,
                  });
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-zinc-100">{t.clienteNome}</span>
                <span className="text-zinc-400"> — {t.pdvNome}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                  {t.codigoDisplay} (c{t.portalClienteId})
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ClientPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: SelectedClient | null;
  onSelect: (t: SelectedClient | null) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerAvisoPdvTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/suporte/player-avisos/pdv-search?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const targets = (data as { targets?: PlayerAvisoPdvTarget[] })?.targets;
          setResults(Array.isArray(targets) ? targets : []);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const clientResults = (() => {
    const seen = new Set<number>();
    const out: PlayerAvisoPdvTarget[] = [];
    for (const t of results) {
      if (seen.has(t.portalClienteId)) continue;
      seen.add(t.portalClienteId);
      out.push(t);
    }
    return out;
  })();

  return (
    <div ref={wrapRef} className="space-y-2">
      {selected ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-emerald-100">{selected.clienteNome}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              Cliente {selected.portalClienteId} · todos os PDVs
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(null)}
            className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            Trocar
          </button>
        </div>
      ) : null}

      <label className="block text-xs text-zinc-500">
        Buscar por nome do cliente
        <input
          type="search"
          value={query}
          disabled={disabled || selected != null}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Ex.: Hering, shopping…"
          className={inputClass + " mt-1"}
        />
      </label>

      {open && !selected && query.trim().length >= 2 ? (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-lg">
          {searching ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p>
          ) : clientResults.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Nenhum resultado com ID Player.</p>
          ) : (
            clientResults.map((t) => (
              <button
                key={`c-${t.portalClienteId}`}
                type="button"
                className="block w-full border-b border-zinc-800 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-900"
                onClick={() => {
                  onSelect({
                    portalClienteId: t.portalClienteId,
                    clienteNome: t.clienteNome,
                  });
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-zinc-100">{t.clienteNome}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  Todos os PDVs · c{t.portalClienteId}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InstalacaoPanel() {
  const [scope, setScope] = useState<TargetScope>("pdv");
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const [selected, setSelected] = useState<SelectedPdv | null>(null);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [tipo, setTipo] = useState<Tipo>("pdv_senha_temp");
  const [electronAuth, setElectronAuth] = useState<ElectronAuthModo>("temp");

  const [link, setLink] = useState("");
  const [exeUrl, setExeUrl] = useState("");
  const [senhaTemp, setSenhaTemp] = useState("");
  const [codigoPlay, setCodigoPlay] = useState("");

  const [destinatario, setDestinatario] = useState<"loja" | "novo">("loja");
  const [emailNovo, setEmailNovo] = useState("");

  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const loadContextoELog = useCallback(async (pdv: SelectedPdv) => {
    setBusy(true);
    try {
      const [{ data: ctxData }, { data: logData }] = await Promise.all([
        postInstalacao({ action: "contexto", portalClienteId: pdv.portalClienteId, portalPdvId: pdv.portalPdvId }),
        postInstalacao({ action: "listar_log", portalClienteId: pdv.portalClienteId, portalPdvId: pdv.portalPdvId }),
      ]);
      const ctx = (ctxData as { contexto?: Contexto })?.contexto;
      setContexto(ctx ?? null);
      const rows = (logData as { rows?: LogRow[] })?.rows;
      setLog(Array.isArray(rows) ? rows : []);
      if (ctx && !destinatarioEmailsValid(ctx.contatoLojaEmail)) setDestinatario("novo");
      else setDestinatario("loja");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setLink("");
    setExeUrl("");
    setSenhaTemp("");
    setCodigoPlay("");
    setStatus(null);
    if (selected) void loadContextoELog(selected);
    else {
      setContexto(null);
      setLog([]);
    }
  }, [selected, loadContextoELog]);

  useEffect(() => {
    setLink("");
    setExeUrl("");
    setSenhaTemp("");
  }, [tipo, electronAuth]);

  const refreshLog = useCallback(async () => {
    if (!selected) return;
    const { data } = await postInstalacao({
      action: "listar_log",
      portalClienteId: selected.portalClienteId,
      portalPdvId: selected.portalPdvId,
    });
    const rows = (data as { rows?: LogRow[] })?.rows;
    setLog(Array.isArray(rows) ? rows : []);
  }, [selected]);

  const plataformaEnvio: Plataforma = tipo === "pdv_play5" ? "mobile" : "windows";

  async function handleGerarLink() {
    if (!selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postInstalacao({
        action: "gerar_link",
        portalClienteId: selected.portalClienteId,
        portalPdvId: selected.portalPdvId,
        tipo,
        plataforma: plataformaEnvio,
        electronAuth: tipo === "electron_ti" ? electronAuth : undefined,
      });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      const d = data as { link?: string; senhaTemporaria?: string; codigoPlay?: string; exeUrl?: string };
      if (tipo === "pdv_play5") {
        setCodigoPlay(d.codigoPlay ?? "");
        setLink("");
        setExeUrl("");
        setSenhaTemp("");
        setStatus({ kind: "ok", text: "Código Google Play gerado (uso único)." });
        void loadContextoELog(selected);
        return;
      }
      setLink(d.link ?? "");
      setExeUrl(d.exeUrl ?? "");
      setSenhaTemp(d.senhaTemporaria ?? "");
      setCodigoPlay("");
      setStatus({ kind: "ok", text: tipo === "electron_ti" ? "Link e instalador gerados." : "Link gerado." });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopiarCodigoPlay() {
    if (!codigoPlay) return;
    try {
      await navigator.clipboard.writeText(codigoPlay.trim());
      setStatus({ kind: "ok", text: "Código PL5 copiado." });
    } catch {
      setStatus({ kind: "err", text: "Não foi possível copiar o código." });
    }
  }

  async function handleCopiar() {
    if (!link) return;
    const url = link.trim();
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ kind: "ok", text: "Link copiado." });
    } catch {
      setStatus({ kind: "err", text: "Não foi possível copiar automaticamente." });
    }
    if (selected) {
      await postInstalacao({
        action: "registrar_copia",
        portalClienteId: selected.portalClienteId,
        portalPdvId: selected.portalPdvId,
        tipo,
        plataforma: plataformaEnvio,
        link: url,
      });
      void refreshLog();
    }
  }

  async function handleCopiarPacoteTemp() {
    if (!link || !senhaTemp) return;
    const url = link.trim();
    try {
      await navigator.clipboard.writeText(`${url}\nSenha temporária: ${senhaTemp.trim()}`);
      setStatus({ kind: "ok", text: "Link e senha copiados." });
    } catch {
      setStatus({ kind: "err", text: "Não foi possível copiar automaticamente." });
    }
  }

  async function handleCopiarSenha() {
    if (!senhaTemp) return;
    try {
      await navigator.clipboard.writeText(senhaTemp.trim());
      setStatus({ kind: "ok", text: "Senha copiada." });
    } catch {
      setStatus({ kind: "err", text: "Não foi possível copiar a senha." });
    }
  }

  async function handleEnviarEmail() {
    if (!selected) return;
    const destino = destinatario === "loja" ? contexto?.contatoLojaEmail ?? "" : emailNovo.trim();
    if (!destinatarioEmailsValid(destino)) {
      setStatus({ kind: "err", text: "E-mail de destino inválido (use vírgula para mais de um)." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postInstalacao({
        action: "enviar_email",
        portalClienteId: selected.portalClienteId,
        portalPdvId: selected.portalPdvId,
        tipo,
        plataforma: plataformaEnvio,
        electronAuth: tipo === "electron_ti" ? electronAuth : undefined,
        email: destinatario === "novo" ? destino : undefined,
        senhaTemporaria: senhaTemp || undefined,
        codigoPlay: tipo === "pdv_play5" ? codigoPlay || undefined : undefined,
      });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      const d = data as { to?: string; senhaTemporaria?: string; link?: string; codigoPlay?: string; exeUrl?: string };
      if (d.senhaTemporaria) setSenhaTemp(d.senhaTemporaria);
      if (typeof d.link === "string" && d.link.trim()) setLink(d.link.trim());
      if (typeof d.exeUrl === "string" && d.exeUrl.trim()) setExeUrl(d.exeUrl.trim());
      if (d.codigoPlay) setCodigoPlay(d.codigoPlay);
      setStatus({ kind: "ok", text: `E-mail enviado para ${d.to ?? destino}.` });
      void refreshLog();
    } finally {
      setBusy(false);
    }
  }

  async function handleEnviarTeste() {
    if (!selected) return;
    const destino =
      destinatario === "loja"
        ? contexto?.contatoLojaEmail?.trim() ?? ""
        : emailNovo.trim();
    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postInstalacao({
        action: "enviar_teste",
        tipo,
        electronAuth: tipo === "electron_ti" ? electronAuth : undefined,
        email: destino || undefined,
      });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      const to = (data as { to?: string })?.to ?? destino ?? "rafael@radioibiza.com.br";
      setStatus({ kind: "ok", text: `E-mail de teste enviado para ${to}.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">1. Cliente e PDV</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setScope("pdv");
              setSelectedClient(null);
            }}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (scope === "pdv"
                ? "bg-fuchsia-900/50 text-fuchsia-100 ring-1 ring-fuchsia-500/40"
                : "border border-zinc-700 text-zinc-400 hover:text-zinc-200")
            }
          >
            1 · PDV
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setScope("cliente");
              setSelected(null);
            }}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (scope === "cliente"
                ? "bg-fuchsia-900/50 text-fuchsia-100 ring-1 ring-fuchsia-500/40"
                : "border border-zinc-700 text-zinc-400 hover:text-zinc-200")
            }
          >
            2 · Cliente
          </button>
        </div>
        {scope === "pdv" ? (
          <PdvPicker selected={selected} onSelect={setSelected} disabled={busy} />
        ) : (
          <ClientPicker selected={selectedClient} onSelect={setSelectedClient} disabled={busy} />
        )}
      </section>

      {scope === "cliente" && selectedClient ? (
        <InstalacaoClientePanel client={selectedClient} />
      ) : null}

      {scope === "pdv" && selected ? (
        <>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">2. Tipo de instalação</h2>
            <div className="space-y-2">
              {INSTALACAO_TIPOS.map((t) => (
                <label
                  key={t.id}
                  className={
                    "flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 " +
                    (tipo === t.id
                      ? "border-fuchsia-600/70 bg-fuchsia-950/20"
                      : "border-zinc-700 hover:border-zinc-600")
                  }
                >
                  <input
                    type="radio"
                    name="tipo"
                    className="mt-1"
                    checked={tipo === t.id}
                    onChange={() => setTipo(t.id)}
                  />
                  <span className="text-sm">
                    <span className="font-medium text-zinc-100">{t.label}</span>
                    <span className="mt-0.5 block text-[12px] text-zinc-400">{t.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {tipo === "electron_ti" ? (
              <div className="mt-4 rounded-lg border border-violet-800/50 bg-violet-950/20 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
                  Autenticação no Player (.exe)
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                    <input
                      type="radio"
                      name="electronAuth"
                      className="mt-1"
                      checked={electronAuth === "temp"}
                      onChange={() => setElectronAuth("temp")}
                    />
                    <span>
                      <span className="font-medium">Senha temporária</span>
                      <span className="mt-0.5 block text-[12px] text-zinc-400">
                        Gera código de uso único — recomendado para entrega ao cliente/TI da loja.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                    <input
                      type="radio"
                      name="electronAuth"
                      className="mt-1"
                      checked={electronAuth === "login"}
                      onChange={() => setElectronAuth("login")}
                    />
                    <span>
                      <span className="font-medium">Login e senha do cliente</span>
                      <span className="mt-0.5 block text-[12px] text-zinc-400">
                        O operador entra com e-mail e senha administrativos do cliente no Player.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            ) : null}

            {tipo === "pdv_play5" && contexto ? (
              <div
                className={
                  "mt-4 rounded-lg border px-3 py-2.5 text-sm " +
                  (contexto.podeGerarCodigoPlay
                    ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-200"
                    : "border-amber-700/60 bg-amber-950/20 text-amber-100")
                }
              >
                {contexto.podeGerarCodigoPlay ? (
                  <p>PDV livre para novo código Play (sem player instalado).</p>
                ) : (
                  <p>
                    PDV com player instalado
                    {contexto.playerInstaladoEm ?
                      ` desde ${new Date(contexto.playerInstaladoEm).toLocaleString("pt-BR")}`
                    : ""}
                    . Regenerar a <strong>chave serial</strong> no Suporte (cadastro do PDV) antes de gerar
                    outro código.
                  </p>
                )}
              </div>
            ) : null}

            {tipo !== "pdv_play5" ? (
              <p className="mt-3 text-[11px] text-zinc-500">
                {tipo === "electron_ti" ? (
                  <>
                    Instalador <strong className="font-medium text-zinc-400">.exe multisusuário</strong> (Electron TI).
                    Tipos 1–4 usam PWA no Chrome. Android: tipo{" "}
                    <strong className="font-medium text-zinc-400">5 · Google Play</strong>.
                  </>
                ) : (
                  <>
                    Instalação no <strong className="font-medium text-zinc-400">Windows Web</strong> (PWA no Chrome).
                    Para celular Android, use o tipo{" "}
                    <strong className="font-medium text-zinc-400">5 · Google Play</strong>.
                    Para .exe TI, use o tipo <strong className="font-medium text-zinc-400">6</strong>.
                  </>
                )}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || (tipo === "pdv_play5" && contexto != null && !contexto.podeGerarCodigoPlay)}
                onClick={handleGerarLink}
                className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
              >
                {tipo === "pdv_play5" ? "Gerar código Play" : tipo === "electron_ti" ? "Gerar link + .exe" : "Gerar link"}
              </button>
              {tipo === "pdv_play5" && codigoPlay ? (
                <button
                  type="button"
                  onClick={() => void handleCopiarCodigoPlay()}
                  className="rounded-lg border border-fuchsia-600/60 bg-fuchsia-950/30 px-4 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-950/50"
                >
                  Copiar código
                </button>
              ) : null}
              {link ? (
                <button
                  type="button"
                  onClick={handleCopiar}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Copiar link
                </button>
              ) : null}
              {link && senhaTemp ? (
                <>
                  <button
                    type="button"
                    onClick={handleCopiarSenha}
                    className="rounded-lg border border-fuchsia-600/60 bg-fuchsia-950/30 px-4 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-950/50"
                  >
                    Copiar senha
                  </button>
                  <button
                    type="button"
                    onClick={handleCopiarPacoteTemp}
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    Copiar link + senha
                  </button>
                </>
              ) : null}
            </div>

            {codigoPlay ? (
              <div className="mt-3 space-y-2 rounded-lg border border-fuchsia-600/50 bg-fuchsia-950/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300/90">
                  Código Google Play (uso único)
                </p>
                <p className="select-all font-mono text-2xl font-bold tracking-[0.2em] text-fuchsia-100">
                  {codigoPlay}
                </p>
                <p className="text-[11px] text-zinc-400">
                  Digite no app instalado pela Play Store. Não compartilhe publicamente.
                </p>
                <p className="break-all font-mono text-[11px] text-emerald-300/90">
                  <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {GOOGLE_PLAY_URL}
                  </a>
                </p>
              </div>
            ) : null}

            {link || exeUrl ? (
              <div className="mt-3 space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                {link ? (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {tipo === "electron_ti" ? "Link de preparação (PDV embutido)" : "Link de instalação"}
                    </p>
                    <p className="break-all font-mono text-[12px] text-emerald-300">{link.trim()}</p>
                  </div>
                ) : null}
                {exeUrl ? (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
                      Instalador .exe (Electron TI)
                    </p>
                    <p className="break-all font-mono text-[12px] text-violet-300">{exeUrl.trim()}</p>
                  </div>
                ) : null}
                {senhaTemp ? (
                  <div className="rounded-lg border border-fuchsia-600/50 bg-fuchsia-950/20 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300/90">
                      Senha temporária (uso único)
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopiarSenha()}
                        title="Copiar senha temporária"
                        className="select-all rounded-lg border border-fuchsia-500/40 bg-zinc-950 px-4 py-2 font-mono text-2xl font-bold tracking-[0.28em] text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-950/40"
                      >
                        {senhaTemp}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopiarSenha}
                        className="rounded-lg border border-fuchsia-600/60 bg-fuchsia-900/40 px-3 py-2 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-900/60"
                      >
                        Copiar senha
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-400">Toque na senha roxa ou use «Copiar senha».</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">3. Enviar por e-mail</h2>
            {tipo === "pdv_play5" ? (
              <p className="mb-3 text-[12px] text-zinc-400">
                O e-mail inclui o link da Google Play e o código PL5
                {codigoPlay ? " gerado acima" : " (será gerado automaticamente ao enviar, se ainda não existir)"}.
              </p>
            ) : tipo === "electron_ti" ? (
              <p className="mb-3 text-[12px] text-zinc-400">
                O e-mail inclui o botão para baixar o instalador .exe e{" "}
                {electronAuth === "temp"
                  ? "a senha temporária (gerada ao enviar, se ainda não existir)."
                  : "as instruções para login e senha do cliente."}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="destinatario"
                  checked={destinatario === "loja"}
                  disabled={!contexto?.contatoLojaEmail || !destinatarioEmailsValid(contexto.contatoLojaEmail)}
                  onChange={() => setDestinatario("loja")}
                />
                Contato da loja (cadastro do PDV):{" "}
                {contexto?.contatoLojaEmail ? (
                  <span className="font-mono text-emerald-300">{contexto.contatoLojaEmail}</span>
                ) : (
                  <span className="text-zinc-500">sem e-mail cadastrado</span>
                )}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="destinatario"
                  checked={destinatario === "novo"}
                  onChange={() => setDestinatario("novo")}
                />
                Outro e-mail
              </label>
              {destinatario === "novo" ? (
                <input
                  type="text"
                  value={emailNovo}
                  onChange={(e) => setEmailNovo(e.target.value)}
                  placeholder="cliente@exemplo.com, ti@exemplo.com"
                  className={inputClass}
                />
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-500">
              Vários destinatários: separe por vírgula — um único e-mail para todos (campo Para).
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={
                  busy ||
                  (tipo === "pdv_play5" && contexto != null && !contexto.podeGerarCodigoPlay && !codigoPlay)
                }
                onClick={handleEnviarEmail}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Enviar e-mail
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleEnviarTeste}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Enviar teste
              </button>
              <p className="text-[11px] text-zinc-500">
                Teste usa o destinatário selecionado acima; se vazio, vai para rafael@radioibiza.com.br.
                Gmail externo pode cair em spam na primeira vez.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Envios deste PDV</h2>
              <button
                type="button"
                onClick={() => void refreshLog()}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Atualizar
              </button>
            </div>
            {log.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhum envio registrado ainda.</p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {log.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="text-zinc-200">{instalacaoTipoLabel(r.tipo)}</span>
                      <span className="text-zinc-500"> · {r.plataforma}</span>
                      <span className="text-zinc-500"> · {r.canal === "email" ? "e-mail" : "link copiado"}</span>
                      {r.destinoEmail ? (
                        <span className="ml-1 font-mono text-[11px] text-emerald-300">{r.destinoEmail}</span>
                      ) : null}
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">
                      {new Date(r.createdAt).toLocaleString("pt-BR")}
                      {r.enviadoPor ? ` · ${r.enviadoPor}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {scope === "pdv" && status ? (
        <p
          className={
            "rounded-lg px-3 py-2 text-sm " +
            (status.kind === "ok"
              ? "bg-emerald-950/40 text-emerald-200"
              : "bg-red-950/40 text-red-200")
          }
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
