"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerAvisoPdvTarget } from "@/lib/suporte/playerAvisoPdvSearch";
import { MICROSOFT_STORE_LISTING_URL } from "@/lib/suporte/microsoft-store/msStoreConstants";
import { destinatarioEmailsValid } from "@/lib/suporte/parseDestinatarioEmails";

type SelectedPdv = {
  portalClienteId: number;
  portalPdvId: number;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
};

type Contexto = {
  contatoLojaEmail: string;
  playerInstaladoEm: string | null;
  podeGerarCodigo: boolean;
};

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40";

async function postMs(body: Record<string, unknown>) {
  const res = await fetch("/api/suporte/microsoft-store", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function PdvSearch({
  selected,
  onSelect,
}: {
  selected: SelectedPdv | null;
  onSelect: (p: SelectedPdv | null) => void;
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

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg border border-sky-800/50 bg-sky-950/30 px-3 py-2">
        <div className="text-sm">
          <p className="font-medium text-sky-100">
            {selected.clienteNome} — {selected.pdvNome}
          </p>
          <p className="font-mono text-xs text-sky-300/80">{selected.codigoDisplay}</p>
        </div>
        <button
          type="button"
          className="text-xs text-zinc-400 hover:text-white"
          onClick={() => onSelect(null)}
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef}>
      <label className="block text-sm text-zinc-300">
        Buscar PDV
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Cliente ou ID PDV…"
          className={inputClass + " mt-1"}
        />
      </label>
      {open && query.trim().length >= 2 ? (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950">
          {searching ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Nenhum PDV.</p>
          ) : (
            results.map((t) => (
              <button
                key={t.portalPdvId}
                type="button"
                className="block w-full border-b border-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-900"
                onClick={() => {
                  onSelect({
                    portalClienteId: t.portalClienteId,
                    portalPdvId: t.portalPdvId,
                    clienteNome: t.clienteNome,
                    pdvNome: t.pdvNome,
                    codigoDisplay: t.codigoDisplay,
                  });
                  setQuery("");
                  setOpen(false);
                }}
              >
                {t.clienteNome} — {t.pdvNome}{" "}
                <span className="font-mono text-xs text-zinc-500">{t.codigoDisplay}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export type MicrosoftStoreEmbeddedPdv = SelectedPdv;

export function MicrosoftStoreInstalacaoPanel({
  embeddedPdv = null,
  hidePdvPicker = false,
  compactIntro = false,
}: {
  embeddedPdv?: MicrosoftStoreEmbeddedPdv | null;
  hidePdvPicker?: boolean;
  compactIntro?: boolean;
} = {}) {
  const [selected, setSelected] = useState<SelectedPdv | null>(embeddedPdv);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [codigoMsStore, setCodigoMsStore] = useState("");
  const [emailNovo, setEmailNovo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadContexto = useCallback(async (pdv: SelectedPdv) => {
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await postMs({
        action: "carregar_contexto",
        portalClienteId: pdv.portalClienteId,
        portalPdvId: pdv.portalPdvId,
      });
      if (!res.ok || !(data as { ok?: boolean }).ok) {
        setContexto(null);
        setMsg("Não foi possível carregar o PDV.");
        return;
      }
      const c = (data as { contexto?: Contexto }).contexto;
      setContexto(c ?? null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (embeddedPdv) setSelected(embeddedPdv);
  }, [embeddedPdv]);

  useEffect(() => {
    if (selected) void loadContexto(selected);
    else {
      setContexto(null);
      setCodigoMsStore("");
    }
  }, [selected, loadContexto]);

  async function gerarCodigo() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await postMs({
        action: "gerar_codigo",
        portalClienteId: selected.portalClienteId,
        portalPdvId: selected.portalPdvId,
      });
      if (!res.ok || !(data as { ok?: boolean }).ok) {
        setMsg((data as { detail?: string })?.detail ?? "Erro ao gerar código.");
        return;
      }
      setCodigoMsStore((data as { codigoMsStore?: string }).codigoMsStore ?? "");
      setMsg("Código MS8 gerado (uso único).");
    } finally {
      setBusy(false);
    }
  }

  async function enviarEmail() {
    if (!selected) return;
    const email = emailNovo.trim() || contexto?.contatoLojaEmail?.trim() || "";
    if (!destinatarioEmailsValid(email)) {
      setMsg("E-mail inválido.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await postMs({
        action: "enviar_email",
        portalClienteId: selected.portalClienteId,
        portalPdvId: selected.portalPdvId,
        email,
        codigoMsStore: codigoMsStore || undefined,
      });
      if (!res.ok || !(data as { ok?: boolean }).ok) {
        setMsg((data as { detail?: string })?.detail ?? "Erro ao enviar e-mail.");
        return;
      }
      if ((data as { codigoMsStore?: string }).codigoMsStore) {
        setCodigoMsStore((data as { codigoMsStore?: string }).codigoMsStore ?? "");
      }
      setMsg("E-mail enviado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!compactIntro ? (
        <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 px-4 py-3 text-sm text-sky-100">
          <strong>Instalação 8 — Microsoft Store.</strong> Módulo isolado: não altera tipos 3–7 nem o PWA{" "}
          <code className="text-xs">player5.radioibiza.app.br</code>. App:{" "}
          <code className="text-xs">msplayer5.radioibiza.app.br</code>.
        </div>
      ) : null}

      {!hidePdvPicker ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">1. Escolher PDV</h2>
          <PdvSearch selected={selected} onSelect={setSelected} />
          {contexto?.playerInstaladoEm ? (
            <p className="mt-3 text-sm text-amber-200">
              Player já instalado — regenere a chave serial antes de novo MS8.
            </p>
          ) : null}
        </section>
      ) : contexto?.playerInstaladoEm ? (
        <p className="text-sm text-amber-200">
          Player já instalado — regenere a chave serial antes de novo MS8.
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          {hidePdvPicker ? "Código MS8" : "2. Código MS8"}
        </h2>
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => void gerarCodigo()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Gerar código MS8
        </button>
        {codigoMsStore ? (
          <div className="mt-3 rounded-lg border border-sky-600/50 bg-sky-950/30 p-3">
            <p className="font-mono text-2xl font-bold tracking-widest text-sky-100">{codigoMsStore}</p>
            <p className="mt-2 break-all text-xs text-emerald-300">
              <a href={MICROSOFT_STORE_LISTING_URL} target="_blank" rel="noopener noreferrer">
                {MICROSOFT_STORE_LISTING_URL}
              </a>
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          {hidePdvPicker ? "Enviar por e-mail" : "3. E-mail"}
        </h2>
        <input
          type="email"
          value={emailNovo}
          onChange={(e) => setEmailNovo(e.target.value)}
          placeholder={contexto?.contatoLojaEmail || "E-mail da loja"}
          className={inputClass}
        />
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => void enviarEmail()}
          className="mt-3 rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Enviar e-mail
        </button>
      </section>

      {msg ? <p className="text-sm text-zinc-300">{msg}</p> : null}
    </div>
  );
}
