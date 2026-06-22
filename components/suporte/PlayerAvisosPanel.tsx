"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPortalPdvIdDisplay, parsePortalPdvDisplay } from "@/lib/player/portalPlayerIds";
import type { PlayerAvisoPdvTarget } from "@/lib/suporte/playerAvisoPdvSearch";
import type { PlayerAvisoRow } from "@/lib/suporte/playerAvisoService";

type Status = { kind: "ok" | "err"; text: string } | null;

type SelectedPdv = {
  portalClienteId: number;
  portalPdvId: number;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
};

function parseClienteIdField(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parsePdvIdField(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const fromDisplay = parsePortalPdvDisplay(t);
  if (fromDisplay != null) return fromDisplay;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function mapApiError(data: unknown): string {
  if (!data || typeof data !== "object") return "Resposta inválida.";
  const err = (data as { error?: unknown }).error;
  if (err === "unauthorized") return "Sessão expirada. Entre novamente no portal.";
  if (err === "mensagem_vazia") return "Escreva a mensagem antes de ativar.";
  if (err === "cliente_pdv_invalido") return "Informe IDs cliente e PDV válidos.";
  if (typeof err === "string" && err.trim()) return err;
  return "Operação falhou.";
}

function parseRows(data: unknown): PlayerAvisoRow[] {
  if (!data || typeof data !== "object" || !("rows" in data)) return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];

  const out: PlayerAvisoRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const cliente_id = parseClienteIdField(String(r.cliente_id ?? ""));
    const pdv_id = parsePdvIdField(String(r.pdv_id ?? ""));
    const mensagem = typeof r.mensagem === "string" ? r.mensagem.trim() : "";
    const atualizado_em =
      typeof r.atualizado_em === "string" ? r.atualizado_em.trim() : "";
    if (cliente_id == null || pdv_id == null || !mensagem) continue;
    out.push({
      cliente_id,
      pdv_id,
      mensagem,
      atualizado_em,
      cliente_nome: typeof r.cliente_nome === "string" ? r.cliente_nome : undefined,
      pdv_nome: typeof r.pdv_nome === "string" ? r.pdv_nome : undefined,
      codigo_display: typeof r.codigo_display === "string" ? r.codigo_display : undefined,
    });
  }
  return out;
}

async function postAvisos(body: Record<string, unknown>) {
  const res = await fetch("/api/suporte/player-avisos", {
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

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/40";

function PdvTargetPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: SelectedPdv | null;
  onSelect: (target: SelectedPdv | null) => void;
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

  function pick(t: PlayerAvisoPdvTarget) {
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
  }

  return (
    <div ref={wrapRef} className="space-y-2">
      {selected ?
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
      : null}

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
          placeholder="Ex.: Hering, shopping, 100.003…"
          className={inputClass + " mt-1"}
        />
      </label>

      {open && !selected && query.trim().length >= 2 ?
        <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-lg">
          {searching ?
            <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p>
          : results.length === 0 ?
            <p className="px-3 py-2 text-xs text-zinc-500">Nenhum PDV com ID Player encontrado.</p>
          : results.map((t) => (
              <button
                key={t.portalPdvId}
                type="button"
                className="block w-full border-b border-zinc-800 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-900"
                onClick={() => pick(t)}
              >
                <span className="font-medium text-zinc-100">{t.clienteNome}</span>
                <span className="text-zinc-400"> — {t.pdvNome}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                  {t.codigoDisplay} (c{t.portalClienteId})
                </span>
              </button>
            ))
          }
        </div>
      : null}

      {!selected ?
        <p className="text-[11px] text-zinc-600">
          Ou informe os IDs manualmente abaixo (aceita código <strong>100.001</strong> no PDV).
        </p>
      : null}
    </div>
  );
}

export function PlayerAvisosPanel() {
  const [selected, setSelected] = useState<SelectedPdv | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [pdvId, setPdvId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [rows, setRows] = useState<PlayerAvisoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const resolveIds = useCallback((): { cid: number; pid: number } | null => {
    if (selected) {
      return { cid: selected.portalClienteId, pid: selected.portalPdvId };
    }
    const cid = parseClienteIdField(clienteId);
    const pid = parsePdvIdField(pdvId);
    if (cid == null || pid == null) return null;
    return { cid, pid };
  }, [selected, clienteId, pdvId]);

  useEffect(() => {
    if (selected) {
      setClienteId(String(selected.portalClienteId));
      setPdvId(selected.codigoDisplay);
    }
  }, [selected]);

  const applyListResponse = useCallback((data: unknown) => {
    setRows(parseRows(data));
  }, []);

  const refreshList = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postAvisos({ action: "listar" });
      if (!res.ok || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
        setStatus({ kind: "err", text: mapApiError(data) });
        setLoaded(false);
        return;
      }
      applyListResponse(data);
      setLoaded(true);
    } finally {
      setBusy(false);
    }
  }, [applyListResponse]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function onAtivar(e: React.FormEvent) {
    e.preventDefault();
    const ids = resolveIds();
    const msg = mensagem.trim();
    if (!ids) {
      setStatus({
        kind: "err",
        text: "Escolha um PDV na busca ou informe ID cliente e ID PDV válidos.",
      });
      return;
    }
    if (!msg) {
      setStatus({ kind: "err", text: "Escreva a mensagem antes de ativar." });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postAvisos({
        action: "ativar",
        cliente_id: ids.cid,
        pdv_id: ids.pid,
        mensagem: msg,
      });
      if (!res.ok || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
        setStatus({ kind: "err", text: mapApiError(data) });
        return;
      }
      applyListResponse(data);
      setMensagem("");
      setStatus({ kind: "ok", text: "Mensagem publicada — o Player 5 busca no próximo ping (~60 min ou ao reabrir)." });
    } finally {
      setBusy(false);
    }
  }

  async function onApagar() {
    const ids = resolveIds();
    if (!ids) {
      setStatus({ kind: "err", text: "Escolha o PDV ou informe IDs para apagar." });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postAvisos({
        action: "apagar",
        cliente_id: ids.cid,
        pdv_id: ids.pid,
      });
      if (!res.ok || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
        setStatus({ kind: "err", text: mapApiError(data) });
        return;
      }
      applyListResponse(data);
      setStatus({ kind: "ok", text: "Mensagens desse cliente/PDV removidas." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-6 text-zinc-100 shadow-xl sm:px-6 sm:py-8">
        <div>
          <h2 className="text-lg font-semibold text-white">Central de avisos — player</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Publica mensagens vermelhas no Player 5. Após cada ping OK, o player consulta{" "}
            <code className="text-[11px]">/api/player-avisos</code> no cloud2 com o token do PDV.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
          <strong>Player 5:</strong> o build precisa de{" "}
          <code className="text-[10px]">VITE_PLAYER_AVISOS_URL=/api/player-avisos</code> e{" "}
          <strong>não</strong> pode ter <code className="text-[10px]">VITE_PLAYER_AVISOS_DISABLED=1</code>.
          O PDV precisa estar instalado (token válido). Mensagens aparecem junto com outros avisos
          vermelhos do cadastro.
        </div>

        {status ?
          <div
            role="status"
            className={
              "mt-4 rounded-xl border px-3 py-2 text-sm " +
              (status.kind === "ok" ?
                "border-emerald-800/60 bg-emerald-950/40 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100")
            }
          >
            {status.text}
          </div>
        : null}

        <form
          onSubmit={onAtivar}
          className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-zinc-900/50 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Nova mensagem</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshList()}
              className="text-[11px] font-medium text-fuchsia-400 hover:text-fuchsia-300 disabled:opacity-40"
            >
              Atualizar lista
            </button>
          </div>

          <PdvTargetPicker selected={selected} onSelect={setSelected} disabled={busy} />

          <div className="grid grid-cols-2 gap-2">
            <input
              inputMode="numeric"
              value={clienteId}
              onChange={(e) => {
                setSelected(null);
                setClienteId(e.target.value);
              }}
              placeholder="ID cliente (100…)"
              className={inputClass}
              disabled={selected != null}
            />
            <input
              value={pdvId}
              onChange={(e) => {
                setSelected(null);
                setPdvId(e.target.value);
              }}
              placeholder="ID PDV (100.001…)"
              className={inputClass}
              disabled={selected != null}
            />
          </div>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Texto exibido em vermelho no player"
            rows={4}
            maxLength={2000}
            className={inputClass + " resize-y"}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !loaded}
              className="rounded-lg bg-red-900/80 px-4 py-2 text-sm font-semibold text-red-50 hover:bg-red-800 disabled:opacity-40"
            >
              Ativar
            </button>
            <button
              type="button"
              disabled={busy || !loaded}
              onClick={() => void onApagar()}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            >
              Apagar mensagens deste par
            </button>
          </div>
        </form>

        {loaded && rows.length > 0 ?
          <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Ativas ({rows.length})
            </p>
            <ul className="mt-3 max-h-[min(50vh,420px)] space-y-2 overflow-y-auto text-sm">
              {rows.map((row, i) => (
                <li key={`${row.cliente_id}-${row.pdv_id}-${row.atualizado_em}-${i}`} className="rounded-lg bg-black/25 px-3 py-2">
                  {row.cliente_nome || row.pdv_nome ?
                    <p className="text-zinc-200">
                      {row.cliente_nome ?? "Cliente"} — {row.pdv_nome ?? "PDV"}
                    </p>
                  : null}
                  <span className="font-mono text-xs text-zinc-500">
                    c{row.cliente_id} · {row.codigo_display ?? formatPortalPdvIdDisplay(row.pdv_id)}
                  </span>
                  <p className="mt-1 text-zinc-200">{row.mensagem}</p>
                  {row.atualizado_em ?
                    <p className="mt-1 text-[10px] text-zinc-600">{row.atualizado_em}</p>
                  : null}
                </li>
              ))}
            </ul>
          </div>
        : loaded ?
          <p className="mt-4 text-sm text-zinc-500">Nenhum aviso ativo no momento.</p>
        : null}
      </div>
    </div>
  );
}
