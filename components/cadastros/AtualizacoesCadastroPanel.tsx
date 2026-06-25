"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LOJA_CADASTRO_FIELDS,
  LOJA_FIELD_LABELS,
  lojaPayloadEntries,
  type LojaCadastroField,
} from "@/lib/player/playerIngestService";

type IngestRow = {
  id: string;
  tipo: string;
  status: string;
  clienteGatewayId: number | null;
  clienteNome: string;
  pdvGatewayId: number | null;
  pdvNome: string;
  portalPdvId: number | null;
  rioPdvKey: string | null;
  mensagem: string;
  payload: Record<string, unknown>;
  chamadoId: string | null;
  createdAt: string;
};

type ProducaoDto = Record<string, unknown>;

function producaoLojaValue(producao: ProducaoDto | null, field: LojaCadastroField): string {
  const v = producao?.[field];
  return typeof v === "string" ? v.trim() : "";
}

export function AtualizacoesCadastroPanel() {
  const [rows, setRows] = useState<IngestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [producao, setProducao] = useState<ProducaoDto | null>(null);
  const [suggestedRioPdvKey, setSuggestedRioPdvKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cadastros/atualizacoes?tipo=cadastro&status=pendente");
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { rows?: IngestRow[] };
      const nextRows = data.rows ?? [];
      setRows(nextRows);
      setSelectedId((prev) => {
        if (prev && nextRows.some((r) => r.id === prev)) return prev;
        return nextRows[0]?.id ?? null;
      });
      window.dispatchEvent(
        new CustomEvent("atl-cadastros-pending-changed", { detail: { count: nextRows.length } }),
      );
    } catch {
      setMsg("Não foi possível carregar atualizações pendentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/cadastros/atualizacoes?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        row?: IngestRow;
        producao?: ProducaoDto | null;
        suggestedRioPdvKey?: string | null;
      };
      setSuggestedRioPdvKey(data.suggestedRioPdvKey ?? data.row?.rioPdvKey ?? null);
      setProducao(data.producao ?? null);
    } catch {
      setProducao(null);
      setSuggestedRioPdvKey(null);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function vincularPdv() {
    if (!selectedId) return;
    if (
      !window.confirm(
        "Aplicar os contatos da loja enviados pelo player ao cadastro de produção?\n\nSó nome, WhatsApp e e-mail da loja serão alterados.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cadastros/atualizacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action: "conciliar" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        const err = data?.error;
        const text =
          err === "pdv_nao_vinculado" ?
            "Não foi possível localizar o PDV de produção."
          : err === "payload_vazio" ?
            "O envio do player não contém contatos da loja."
          : err === "server_error" ?
            "Erro no servidor ao conciliar. Tente de novo em instantes."
          : err ?? "conciliar_failed";
        throw new Error(text);
      }
      setMsg("Cadastro vinculado e contatos da loja atualizados.");
      await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao vincular PDV.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelarConciliar() {
    if (!selectedId) return;
    if (
      !window.confirm(
        "Descartar esta atualização sem alterar o cadastro?\n\nUse quando os dados atuais já estiverem corretos.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cadastros/atualizacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action: "arquivar" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "arquivar_failed");
      setMsg("Atualização descartada (cadastro mantido).");
      await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setBusy(false);
    }
  }

  const enviado = selected ? lojaPayloadEntries(selected.payload) : [];
  const cadastroEncontrado = Boolean(producao && suggestedRioPdvKey);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Cadastros / Atl. cadastros
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Atualizações de cadastro</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Dados da loja enviados pelo Player 5 na instalação — compare com o cadastro atual, vincule ou
        descarte se já estiver correto.
      </p>

      {msg ?
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {msg}
        </div>
      : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-500 dark:border-slate-800">
            Pendentes ({rows.length})
          </div>
          {loading ?
            <div className="p-4 text-sm text-slate-500">Carregando…</div>
          : rows.length === 0 ?
            <div className="p-4 text-sm text-slate-500">Nenhuma atualização pendente.</div>
          : (
            <ul className="max-h-[520px] overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                      selectedId === r.id ? "bg-sky-50 dark:bg-sky-950/40" : ""
                    }`}
                  >
                    <div className="font-semibold">{r.clienteNome || "Cliente"}</div>
                    <div className="text-xs text-slate-500">{r.pdvNome || "PDV"}</div>
                    <div className="text-[10px] text-slate-400">
                      {r.clienteGatewayId != null ? `cli ${r.clienteGatewayId}` : ""}
                      {r.pdvGatewayId != null ? ` · pdv ${r.pdvGatewayId}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {selected ?
          <div className="space-y-4">
            <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {selected.clienteNome || "Cliente"}
                <span className="mx-2 font-normal text-slate-400">·</span>
                {selected.pdvNome || "PDV"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {selected.clienteGatewayId != null ? `Cliente Player ${selected.clienteGatewayId}` : "—"}
                {selected.pdvGatewayId != null ? ` · PDV ${selected.pdvGatewayId}` : ""}
                {selected.portalPdvId != null ? ` · portal ${selected.portalPdvId}` : ""}
              </p>
              {suggestedRioPdvKey ?
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  Cadastro produção: <span className="font-mono">{suggestedRioPdvKey}</span>
                </p>
              : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Enviado pelo player
                </h2>
                <dl className="mt-3 space-y-3 text-sm">
                  {enviado.length === 0 ?
                    <div className="text-slate-500">Sem contatos da loja neste envio.</div>
                  : (
                    enviado.map(({ field, label, value }) => (
                      <div key={field}>
                        <dt className="text-[10px] font-bold uppercase text-slate-400">{label}</dt>
                        <dd className="text-slate-800 dark:text-slate-100">{value}</dd>
                      </div>
                    ))
                  )}
                </dl>
              </section>

              <div className="flex flex-col items-center justify-center gap-2 px-1">
                <button
                  type="button"
                  disabled={busy || !cadastroEncontrado || enviado.length === 0}
                  onClick={() => void vincularPdv()}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40"
                  title={
                    !cadastroEncontrado ?
                      "Cadastro de produção não encontrado para este cliente/PDV."
                    : enviado.length === 0 ?
                      "Nenhum contato da loja no envio."
                    : "Aplicar contatos da loja ao cadastro"
                  }
                >
                  Vincular PDV
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancelarConciliar()}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
                >
                  Cancelar conciliar
                </button>
              </div>

              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Cadastro atual (produção)
                </h2>
                {!cadastroEncontrado ?
                  <p className="mt-3 text-sm text-slate-500">
                    Não foi possível localizar o cadastro de produção para este cliente/PDV.
                  </p>
                : (
                  <dl className="mt-3 space-y-3 text-sm">
                    {LOJA_CADASTRO_FIELDS.map((field) => {
                      const value = producaoLojaValue(producao, field);
                      return (
                        <div key={field}>
                          <dt className="text-[10px] font-bold uppercase text-slate-400">
                            {LOJA_FIELD_LABELS[field]}
                          </dt>
                          <dd className={value ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}>
                            {value || "—"}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </section>
            </div>
          </div>
        : (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
            Selecione uma atualização pendente.
          </div>
        )}
      </div>
    </div>
  );
}
