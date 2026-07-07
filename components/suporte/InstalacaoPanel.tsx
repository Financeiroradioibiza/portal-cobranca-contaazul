"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerAvisoPdvTarget } from "@/lib/suporte/playerAvisoPdvSearch";

type Status = { kind: "ok" | "err"; text: string } | null;

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

type Tipo = "padrao_cliente" | "pdv_login" | "pdv_senha_temp";
type Plataforma = "windows" | "mobile";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/40";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TIPOS: { id: Tipo; label: string; desc: string }[] = [
  {
    id: "padrao_cliente",
    label: "1 · Instalação padrão (cliente)",
    desc: "Link padrão de instalação. O cliente entra com e-mail/senha e escolhe o PDV na lista.",
  },
  {
    id: "pdv_login",
    label: "2 · Instalação do PDV com login",
    desc: "Link já com o PDV embutido. O cliente entra com a senha padrão — o PDV já vem selecionado.",
  },
  {
    id: "pdv_senha_temp",
    label: "3 · Instalação do PDV com senha temporária",
    desc: "Link com o PDV embutido + senha de uso único. Vale só uma instalação; depois é preciso gerar outra.",
  },
];

function mapErr(data: unknown): string {
  const err = (data as { error?: unknown })?.error;
  if (err === "unauthorized") return "Sessão expirada. Entre novamente no portal.";
  if (err === "cliente_pdv_invalido") return "Selecione um PDV válido.";
  if (err === "pdv_nao_encontrado") return "PDV não encontrado (sem ID Player?).";
  if (err === "tipo_plataforma_invalido") return "Escolha o tipo e a plataforma.";
  if (err === "email_invalido") return "E-mail de destino inválido.";
  if (err === "smtp_nao_configurado") return "SMTP não configurado no ambiente (OC_EMAIL_SMTP_*).";
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

function tipoLabel(t: string): string {
  if (t === "pdv_login") return "PDV com login";
  if (t === "pdv_senha_temp") return "PDV senha temporária";
  return "Padrão cliente";
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

export function InstalacaoPanel() {
  const [selected, setSelected] = useState<SelectedPdv | null>(null);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [tipo, setTipo] = useState<Tipo>("padrao_cliente");
  const [plataforma, setPlataforma] = useState<Plataforma>("windows");

  const [link, setLink] = useState("");
  const [senhaTemp, setSenhaTemp] = useState("");

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
      if (ctx && !ctx.contatoLojaEmail) setDestinatario("novo");
      else setDestinatario("loja");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setLink("");
    setSenhaTemp("");
    setStatus(null);
    if (selected) void loadContextoELog(selected);
    else {
      setContexto(null);
      setLog([]);
    }
  }, [selected, loadContextoELog]);

  useEffect(() => {
    setLink("");
    setSenhaTemp("");
  }, [tipo, plataforma]);

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
        plataforma,
      });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      const d = data as { link?: string; senhaTemporaria?: string };
      setLink(d.link ?? "");
      setSenhaTemp(d.senhaTemporaria ?? "");
      setStatus({ kind: "ok", text: "Link gerado." });
    } finally {
      setBusy(false);
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
        plataforma,
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

  async function handleEnviarEmail() {
    if (!selected) return;
    const destino = destinatario === "loja" ? contexto?.contatoLojaEmail ?? "" : emailNovo.trim();
    if (!EMAIL_RE.test(destino)) {
      setStatus({ kind: "err", text: "E-mail de destino inválido." });
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
        plataforma,
        email: destinatario === "novo" ? destino : undefined,
        senhaTemporaria: senhaTemp || undefined,
      });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      const d = data as { to?: string; senhaTemporaria?: string; link?: string };
      if (d.senhaTemporaria) setSenhaTemp(d.senhaTemporaria);
      if (typeof d.link === "string" && d.link.trim()) setLink(d.link.trim());
      setStatus({ kind: "ok", text: `E-mail enviado para ${d.to ?? destino}.` });
      void refreshLog();
    } finally {
      setBusy(false);
    }
  }

  async function handleEnviarTeste() {
    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postInstalacao({ action: "enviar_teste" });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      setStatus({ kind: "ok", text: "E-mail de teste enviado para rafael@radioibiza.com.br." });
    } finally {
      setBusy(false);
    }
  }

  const podeMobile = true;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">1. Cliente e PDV</h2>
        <PdvPicker selected={selected} onSelect={setSelected} disabled={busy} />
      </section>

      {selected ? (
        <>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">2. Tipo de instalação</h2>
            <div className="space-y-2">
              {TIPOS.map((t) => (
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

            {podeMobile ? (
              <div className="mt-4">
                <p className="mb-1.5 text-xs text-zinc-500">Plataforma</p>
                <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
                  {(["windows", "mobile"] as Plataforma[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlataforma(p)}
                      className={
                        "rounded-md px-4 py-1.5 text-sm " +
                        (plataforma === p ? "bg-fuchsia-600 text-white" : "text-zinc-400 hover:text-zinc-200")
                      }
                    >
                      {p === "windows" ? "Windows" : "Mobile"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleGerarLink}
                className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
              >
                Gerar link
              </button>
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
                <button
                  type="button"
                  onClick={handleCopiarPacoteTemp}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Copiar link + senha
                </button>
              ) : null}
            </div>

            {link ? (
              <div className="mt-3 space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                <p className="break-all font-mono text-[12px] text-emerald-300">{link.trim()}</p>
                {senhaTemp ? (
                  <p className="text-sm text-zinc-200">
                    Senha temporária (uso único):{" "}
                    <span className="font-mono text-lg font-bold tracking-widest text-fuchsia-300">
                      {senhaTemp}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">3. Enviar por e-mail</h2>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="destinatario"
                  checked={destinatario === "loja"}
                  disabled={!contexto?.contatoLojaEmail}
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
                  type="email"
                  value={emailNovo}
                  onChange={(e) => setEmailNovo(e.target.value)}
                  placeholder="cliente@exemplo.com"
                  className={inputClass}
                />
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
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
                Enviar teste (rafael@)
              </button>
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
                      <span className="text-zinc-200">{tipoLabel(r.tipo)}</span>
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

      {status ? (
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
