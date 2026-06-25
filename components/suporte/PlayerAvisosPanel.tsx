"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPortalPdvIdDisplay, parsePortalPdvDisplay } from "@/lib/player/portalPlayerIds";
import type { PlayerAvisoPdvTarget } from "@/lib/suporte/playerAvisoPdvSearch";
import type { PlayerAvisoListEntry } from "@/lib/suporte/playerAvisoService";

type Status = { kind: "ok" | "err"; text: string } | null;
type TargetScope = "pdv" | "cliente";

type SelectedPdv = {
  portalClienteId: number;
  portalPdvId: number;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
};

type SelectedClient = {
  portalClienteId: number;
  clienteNome: string;
};

const AVISO_TEMPLATES = [
  "Favor atualize o seu cadasto abaixo :)",
  "Favor enviar contato da loja no Feedback.",
  "Favor enviar contato do financeiro no Feedback.",
  "Favor entrar em contato com Suporte :)",
  "Favor entrar em contato com Financeiro :)",
  "Favor entrar em contato com Atendimento :)",
] as const;

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
  if (err === "cliente_sem_pdvs") return "Este cliente não tem PDVs com ID Player.";
  if (err === "aviso_nao_encontrado") return "Aviso não encontrado (já desativado?).";
  if (typeof err === "string" && err.trim()) return err;
  return "Operação falhou.";
}

function parseEntries(data: unknown): PlayerAvisoListEntry[] {
  if (!data || typeof data !== "object" || !("rows" in data)) return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];

  const out: PlayerAvisoListEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const cliente_id = parseClienteIdField(String(r.cliente_id ?? ""));
    const mensagem = typeof r.mensagem === "string" ? r.mensagem.trim() : "";
    const deactivate_key =
      typeof r.deactivate_key === "string" ? r.deactivate_key.trim() : "";
    const scope = r.scope === "cliente" ? "cliente" : "pdv";
    const atualizado_em =
      typeof r.atualizado_em === "string" ? r.atualizado_em.trim() : "";
    if (cliente_id == null || !mensagem || !deactivate_key) continue;

    const pdvRaw = r.pdv_id;
    const pdv_id =
      pdvRaw == null || pdvRaw === "" ?
        null
      : parsePdvIdField(String(pdvRaw));

    out.push({
      scope,
      deactivate_key,
      cliente_id,
      pdv_id,
      pdv_count: typeof r.pdv_count === "number" && r.pdv_count > 0 ? r.pdv_count : 1,
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
  scope,
  selectedPdv,
  selectedClient,
  onSelectPdv,
  onSelectClient,
  disabled,
}: {
  scope: TargetScope;
  selectedPdv: SelectedPdv | null;
  selectedClient: SelectedClient | null;
  onSelectPdv: (target: SelectedPdv | null) => void;
  onSelectClient: (target: SelectedClient | null) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerAvisoPdvTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = scope === "pdv" ? selectedPdv : selectedClient;

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
    if (scope === "cliente") {
      onSelectClient({
        portalClienteId: t.portalClienteId,
        clienteNome: t.clienteNome,
      });
    } else {
      onSelectPdv({
        portalClienteId: t.portalClienteId,
        portalPdvId: t.portalPdvId,
        clienteNome: t.clienteNome,
        pdvNome: t.pdvNome,
        codigoDisplay: t.codigoDisplay,
      });
    }
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const clientResults =
    scope === "cliente" ?
      (() => {
        const seen = new Set<number>();
        const out: PlayerAvisoPdvTarget[] = [];
        for (const t of results) {
          if (seen.has(t.portalClienteId)) continue;
          seen.add(t.portalClienteId);
          out.push(t);
        }
        return out;
      })()
    : results;

  return (
    <div ref={wrapRef} className="space-y-2">
      {selected ?
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2">
          <div className="min-w-0 text-sm">
            {scope === "pdv" && selectedPdv ?
              <>
                <p className="font-medium text-emerald-100">{selectedPdv.clienteNome}</p>
                <p className="text-zinc-300">{selectedPdv.pdvNome}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">
                  Cliente {selectedPdv.portalClienteId} · PDV {selectedPdv.codigoDisplay}
                </p>
              </>
            : selectedClient ?
              <>
                <p className="font-medium text-emerald-100">{selectedClient.clienteNome}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">
                  Cliente {selectedClient.portalClienteId} · todos os PDVs
                </p>
              </>
            : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (scope === "pdv") onSelectPdv(null);
              else onSelectClient(null);
            }}
            className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            Trocar
          </button>
        </div>
      : null}

      <label className="block text-xs text-zinc-500">
        Buscar por nome do cliente{scope === "pdv" ? " ou PDV" : ""}
        <input
          type="search"
          value={query}
          disabled={disabled || selected != null}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={scope === "cliente" ? "Ex.: Hering, shopping…" : "Ex.: Hering, shopping, 100.003…"}
          className={inputClass + " mt-1"}
        />
      </label>

      {open && !selected && query.trim().length >= 2 ?
        <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-lg">
          {searching ?
            <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p>
          : clientResults.length === 0 ?
            <p className="px-3 py-2 text-xs text-zinc-500">Nenhum resultado com ID Player.</p>
          : clientResults.map((t) => (
              <button
                key={scope === "cliente" ? `c-${t.portalClienteId}` : t.portalPdvId}
                type="button"
                className="block w-full border-b border-zinc-800 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-900"
                onClick={() => pick(t)}
              >
                <span className="font-medium text-zinc-100">{t.clienteNome}</span>
                {scope === "pdv" ?
                  <>
                    <span className="text-zinc-400"> — {t.pdvNome}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                      {t.codigoDisplay} (c{t.portalClienteId})
                    </span>
                  </>
                : <span className="mt-0.5 block text-[10px] text-zinc-500">Todos os PDVs · c{t.portalClienteId}</span>}
              </button>
            ))
          }
        </div>
      : null}

      {!selected ?
        <p className="text-[11px] text-zinc-600">
          {scope === "cliente" ?
            "Ou informe só o ID cliente abaixo."
          : "Ou informe os IDs manualmente abaixo (aceita código 100.001 no PDV)."}
        </p>
      : null}
    </div>
  );
}

export function PlayerAvisosPanel() {
  const [scope, setScope] = useState<TargetScope>("pdv");
  const [selectedPdv, setSelectedPdv] = useState<SelectedPdv | null>(null);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [pdvId, setPdvId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [entries, setEntries] = useState<PlayerAvisoListEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const resolveClienteId = useCallback((): number | null => {
    if (scope === "cliente" && selectedClient) return selectedClient.portalClienteId;
    if (scope === "pdv" && selectedPdv) return selectedPdv.portalClienteId;
    return parseClienteIdField(clienteId);
  }, [scope, selectedClient, selectedPdv, clienteId]);

  const resolvePdvIds = useCallback((): { cid: number; pid: number } | null => {
    if (selectedPdv) {
      return { cid: selectedPdv.portalClienteId, pid: selectedPdv.portalPdvId };
    }
    const cid = parseClienteIdField(clienteId);
    const pid = parsePdvIdField(pdvId);
    if (cid == null || pid == null) return null;
    return { cid, pid };
  }, [selectedPdv, clienteId, pdvId]);

  useEffect(() => {
    if (selectedPdv) {
      setClienteId(String(selectedPdv.portalClienteId));
      setPdvId(selectedPdv.codigoDisplay);
    }
  }, [selectedPdv]);

  useEffect(() => {
    if (selectedClient) {
      setClienteId(String(selectedClient.portalClienteId));
      setPdvId("");
    }
  }, [selectedClient]);

  const applyListResponse = useCallback((data: unknown) => {
    setEntries(parseEntries(data));
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
    const msg = mensagem.trim();
    if (!msg) {
      setStatus({ kind: "err", text: "Escreva a mensagem antes de ativar." });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      if (scope === "cliente") {
        const cid = resolveClienteId();
        if (cid == null) {
          setStatus({
            kind: "err",
            text: "Escolha o cliente na busca ou informe o ID cliente válido.",
          });
          return;
        }
        const { res, data } = await postAvisos({
          action: "ativar_cliente",
          cliente_id: cid,
          mensagem: msg,
        });
        if (!res.ok || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
          setStatus({ kind: "err", text: mapApiError(data) });
          return;
        }
        applyListResponse(data);
        setMensagem("");
        setStatus({
          kind: "ok",
          text: "Mensagem publicada para todos os PDVs do cliente — o Player 5 busca no próximo ping.",
        });
        return;
      }

      const ids = resolvePdvIds();
      if (!ids) {
        setStatus({
          kind: "err",
          text: "Escolha um PDV na busca ou informe ID cliente e ID PDV válidos.",
        });
        return;
      }

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
      setStatus({
        kind: "ok",
        text: "Mensagem publicada — o Player 5 busca no próximo ping (~60 min ou ao reabrir).",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onApagar() {
    const ids = resolvePdvIds();
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

  async function onDesativar(entry: PlayerAvisoListEntry) {
    setBusy(true);
    setStatus(null);
    try {
      const { res, data } = await postAvisos({
        action: "desativar",
        deactivate_key: entry.deactivate_key,
      });
      if (!res.ok || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
        setStatus({ kind: "err", text: mapApiError(data) });
        return;
      }
      applyListResponse(data);
      setStatus({
        kind: "ok",
        text:
          entry.scope === "cliente" ?
            "Aviso desativado em todos os PDVs do cliente."
          : "Aviso desativado.",
      });
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
          <div className="flex flex-wrap items-center justify-between gap-2">
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setScope("pdv");
                setSelectedClient(null);
              }}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                (scope === "pdv" ?
                  "bg-fuchsia-900/50 text-fuchsia-100 ring-1 ring-fuchsia-500/40"
                : "border border-zinc-700 text-zinc-400 hover:text-zinc-200")
              }
            >
              Um PDV
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setScope("cliente");
                setSelectedPdv(null);
                setPdvId("");
              }}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                (scope === "cliente" ?
                  "bg-fuchsia-900/50 text-fuchsia-100 ring-1 ring-fuchsia-500/40"
                : "border border-zinc-700 text-zinc-400 hover:text-zinc-200")
              }
            >
              Todos PDVs do cliente
            </button>
          </div>

          <PdvTargetPicker
            scope={scope}
            selectedPdv={selectedPdv}
            selectedClient={selectedClient}
            onSelectPdv={(t) => {
              setSelectedPdv(t);
              setSelectedClient(null);
            }}
            onSelectClient={(t) => {
              setSelectedClient(t);
              setSelectedPdv(null);
            }}
            disabled={busy}
          />

          <div className={scope === "cliente" ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
            <input
              inputMode="numeric"
              value={clienteId}
              onChange={(e) => {
                setSelectedPdv(null);
                setSelectedClient(null);
                setClienteId(e.target.value);
              }}
              placeholder="ID cliente (100…)"
              className={inputClass}
              disabled={selectedPdv != null || selectedClient != null}
            />
            {scope === "pdv" ?
              <input
                value={pdvId}
                onChange={(e) => {
                  setSelectedPdv(null);
                  setPdvId(e.target.value);
                }}
                placeholder="ID PDV (100.001…)"
                className={inputClass}
                disabled={selectedPdv != null}
              />
            : null}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Modelos (clique para usar)
            </p>
            <div className="flex flex-wrap gap-2">
              {AVISO_TEMPLATES.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  disabled={busy}
                  onClick={() => setMensagem(tpl)}
                  className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1.5 text-left text-[11px] leading-snug text-zinc-300 transition hover:border-fuchsia-500/40 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
                >
                  {tpl}
                </button>
              ))}
            </div>
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
            {scope === "pdv" ?
              <button
                type="button"
                disabled={busy || !loaded}
                onClick={() => void onApagar()}
                className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
              >
                Apagar mensagens deste par
              </button>
            : null}
          </div>
        </form>

        {loaded && entries.length > 0 ?
          <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Ativas ({entries.length})
            </p>
            <ul className="mt-3 max-h-[min(50vh,420px)] space-y-2 overflow-y-auto text-sm">
              {entries.map((entry) => (
                <li
                  key={entry.deactivate_key}
                  className="flex items-start justify-between gap-3 rounded-lg bg-black/25 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    {entry.scope === "cliente" ?
                      <p className="text-zinc-200">
                        <span className="font-medium">{entry.cliente_nome ?? "Cliente"}</span>
                        <span className="text-zinc-500"> · todos os PDVs</span>
                        {entry.pdv_count > 1 ?
                          <span className="text-zinc-500"> ({entry.pdv_count})</span>
                        : null}
                      </p>
                    : entry.cliente_nome || entry.pdv_nome ?
                      <p className="text-zinc-200">
                        {entry.cliente_nome ?? "Cliente"} — {entry.pdv_nome ?? "PDV"}
                      </p>
                    : null}
                    <span className="font-mono text-xs text-zinc-500">
                      c{entry.cliente_id}
                      {entry.scope === "pdv" && entry.pdv_id != null ?
                        <> · {entry.codigo_display ?? formatPortalPdvIdDisplay(entry.pdv_id)}</>
                      : null}
                    </span>
                    <p className="mt-1 text-zinc-200">{entry.mensagem}</p>
                    {entry.atualizado_em ?
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {new Date(entry.atualizado_em).toLocaleString("pt-BR")}
                      </p>
                    : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDesativar(entry)}
                    className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    Desativar
                  </button>
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
