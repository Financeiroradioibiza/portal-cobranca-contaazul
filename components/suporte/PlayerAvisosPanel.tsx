"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlayerAvisoRow } from "@/lib/suporte/playerAvisoService";

type Status = { kind: "ok" | "err"; text: string } | null;

function parseIdField(raw: string): number | null {
  const t = raw.trim();
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
    const cliente_id = parseIdField(String(r.cliente_id ?? ""));
    const pdv_id = parseIdField(String(r.pdv_id ?? ""));
    const mensagem = typeof r.mensagem === "string" ? r.mensagem.trim() : "";
    const atualizado_em =
      typeof r.atualizado_em === "string" ? r.atualizado_em.trim() : "";
    if (cliente_id == null || pdv_id == null || !mensagem) continue;
    out.push({ cliente_id, pdv_id, mensagem, atualizado_em });
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

export function PlayerAvisosPanel() {
  const [clienteId, setClienteId] = useState("");
  const [pdvId, setPdvId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [rows, setRows] = useState<PlayerAvisoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>(null);

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
    const cid = parseIdField(clienteId);
    const pid = parseIdField(pdvId);
    const msg = mensagem.trim();
    if (cid == null || pid == null) {
      setStatus({ kind: "err", text: "Informe ID cliente e ID PDV válidos (IDs Player do portal)." });
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
        cliente_id: cid,
        pdv_id: pid,
        mensagem: msg,
      });
      if (!res.ok || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
        setStatus({ kind: "err", text: mapApiError(data) });
        return;
      }
      applyListResponse(data);
      setMensagem("");
      setStatus({ kind: "ok", text: "Mensagem publicada." });
    } finally {
      setBusy(false);
    }
  }

  async function onApagar() {
    const cid = parseIdField(clienteId);
    const pid = parseIdField(pdvId);
    if (cid == null || pid == null) {
      setStatus({ kind: "err", text: "Informe ID cliente e ID PDV para apagar." });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postAvisos({
        action: "apagar",
        cliente_id: cid,
        pdv_id: pid,
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
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-6 text-zinc-100 shadow-xl sm:px-6 sm:py-8">
        <div>
          <h2 className="text-lg font-semibold text-white">Central de avisos — player</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Publica mensagens vermelhas no Player 5 (após o ping ao gateway). Use os IDs Player
            do portal (ex.: 100, 100.001) — os mesmos de Logins e IDs Player.
          </p>
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
          <div className="grid grid-cols-2 gap-2">
            <input
              inputMode="numeric"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              placeholder="ID cliente (100…)"
              className={inputClass}
            />
            <input
              inputMode="numeric"
              value={pdvId}
              onChange={(e) => setPdvId(e.target.value)}
              placeholder="ID PDV (100.001…)"
              className={inputClass}
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
                  <span className="font-mono text-xs text-zinc-500">
                    c{row.cliente_id} · pdv{row.pdv_id}
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
