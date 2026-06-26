"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COBRANCA_CADASTRO_FIELDS,
  COBRANCA_FIELD_LABELS,
  LOJA_CADASTRO_FIELDS,
  LOJA_FIELD_LABELS,
  cadastroSecaoLabel,
  financeiroPayloadEntries,
  lojaPayloadEntries,
  resolveCadastroSecao,
  type CobrancaCadastroField,
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

function producaoFinanceiroValue(producao: ProducaoDto | null, field: CobrancaCadastroField): string {
  const v = producao?.[field];
  return typeof v === "string" ? v.trim() : "";
}

function mapConciliarError(data: unknown): string {
  const err =
    data && typeof data === "object" && "error" in data ?
      (data as { error?: unknown }).error
    : undefined;
  if (err === "pdv_nao_vinculado") return "Não foi possível localizar o PDV de produção.";
  if (err === "payload_vazio") return "O envio do player não contém dados para esta seção.";
  if (err === "server_error") return "Erro no servidor ao conciliar. Tente de novo em instantes.";
  if (typeof err === "string" && err.trim()) return err;
  return "conciliar_failed";
}

async function conciliarIngest(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/cadastros/atualizacoes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "conciliar" }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: mapConciliarError(data) };
  return { ok: true };
}

type BulkProgress = {
  index: number;
  total: number;
  label: string;
  ok: number;
  failed: number;
};

export function AtualizacoesCadastroPanel() {
  const [rows, setRows] = useState<IngestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [producao, setProducao] = useState<ProducaoDto | null>(null);
  const [suggestedRioPdvKey, setSuggestedRioPdvKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err">("ok");

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cadastros/atualizacoes?tipo=cadastro&status=pendente");
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { rows?: IngestRow[] };
      const nextRows = data.rows ?? [];
      setRows(nextRows);
      setCheckedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (nextRows.some((r) => r.id === id)) next.add(id);
        }
        return next;
      });
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
      const result = await conciliarIngest(selectedId);
      if (!result.ok) throw new Error(result.error);
      setMsgKind("ok");
      setMsg("Cadastro vinculado e contatos da loja atualizados.");
      await loadList();
    } catch (e) {
      setMsgKind("err");
      setMsg(e instanceof Error ? e.message : "Falha ao vincular PDV.");
    } finally {
      setBusy(false);
    }
  }

  async function vincularSelecionados() {
    const ids = rows.filter((r) => checkedIds.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Vincular ${ids.length} atualização(ões) uma por uma?\n\nSó nome, WhatsApp e e-mail da loja serão alterados em cada PDV.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setBulkProgress(null);
    setMsg(null);

    let ok = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const row = rows.find((r) => r.id === id);
      const label = row ?
        `${row.clienteNome || "Cliente"} — ${row.pdvNome || "PDV"}`
      : id;

      setBulkProgress({ index: i + 1, total: ids.length, label, ok, failed });
      setSelectedId(id);

      const result = await conciliarIngest(id);
      if (result.ok) {
        ok += 1;
      } else {
        failed += 1;
        errors.push(`${label}: ${result.error}`);
      }
    }

    setBulkProgress({ index: ids.length, total: ids.length, label: "Concluído", ok, failed });
    setCheckedIds(new Set());
    await loadList();

    if (failed === 0) {
      setMsgKind("ok");
      setMsg(`${ok} cadastro(s) vinculado(s) com sucesso.`);
    } else if (ok === 0) {
      setMsgKind("err");
      setMsg(`Nenhum vinculado. ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? "…" : ""}`);
    } else {
      setMsgKind("err");
      setMsg(`${ok} vinculado(s), ${failed} falha(s). ${errors.slice(0, 2).join(" · ")}${errors.length > 2 ? "…" : ""}`);
    }

    setBusy(false);
    setBulkProgress(null);
  }

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (checkedIds.size === rows.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(rows.map((r) => r.id)));
    }
  }

  const allSelected = rows.length > 0 && checkedIds.size === rows.length;
  const someSelected = checkedIds.size > 0;

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
      setMsgKind("ok");
      setMsg("Atualização descartada (cadastro mantido).");
      await loadList();
    } catch (e) {
      setMsgKind("err");
      setMsg(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setBusy(false);
    }
  }

  const selectedSecao = selected ? resolveCadastroSecao(selected.payload) : "loja";
  const enviado = selected ?
    selectedSecao === "financeiro" ?
      financeiroPayloadEntries(selected.payload)
    : lojaPayloadEntries(selected.payload)
  : [];
  const cadastroEncontrado = Boolean(producao && suggestedRioPdvKey);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Cadastros / Atl. cadastros
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Atualizações de cadastro</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Atualizações enviadas pelo Player 5 — loja e financeiro separados. Compare com o cadastro
        atual, vincule ou descarte se já estiver correto.
      </p>

      {msg ?
        <div
          className={
            "mt-4 rounded-lg border px-3 py-2 text-sm " +
            (msgKind === "ok" ?
              "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200")
          }
        >
          {msg}
        </div>
      : null}

      {bulkProgress ?
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          <p className="font-semibold">
            Vinculando {bulkProgress.index} de {bulkProgress.total}
            {bulkProgress.label !== "Concluído" ?
              <> — {bulkProgress.label}</>
            : null}
          </p>
          <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-200/80">
            {bulkProgress.ok} ok · {bulkProgress.failed} falha(s) — aguarde, um por vez…
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-200/80 dark:bg-sky-900">
            <div
              className="h-full rounded-full bg-sky-600 transition-all duration-300 dark:bg-sky-400"
              style={{ width: `${Math.round((bulkProgress.index / bulkProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase text-slate-500">
                Pendentes ({rows.length})
              </span>
              {rows.length > 0 ?
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={busy || loading}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300"
                  />
                  Todos
                </label>
              : null}
            </div>
            {someSelected ?
              <button
                type="button"
                disabled={busy}
                onClick={() => void vincularSelecionados()}
                className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-bold text-white shadow disabled:opacity-40"
              >
                Vincular selecionados ({checkedIds.size})
              </button>
            : null}
          </div>
          {loading ?
            <div className="p-4 text-sm text-slate-500">Carregando…</div>
          : rows.length === 0 ?
            <div className="p-4 text-sm text-slate-500">Nenhuma atualização pendente.</div>
          : (
            <ul className="max-h-[520px] overflow-y-auto">
              {rows.map((r) => {
                const isActive = selectedId === r.id;
                const isChecked = checkedIds.has(r.id);
                const isProcessing = bulkProgress != null && isActive && bulkProgress.label !== "Concluído";
                return (
                  <li key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <div
                      className={`flex items-start gap-2 px-2 py-2 ${isActive ? "bg-sky-50 dark:bg-sky-950/40" : ""} ${isProcessing ? "ring-1 ring-inset ring-sky-400/60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={busy}
                        onChange={() => toggleChecked(r.id)}
                        className="mt-1 shrink-0 rounded border-slate-300"
                        aria-label={`Selecionar ${r.clienteNome}`}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedId(r.id)}
                        className="min-w-0 flex-1 text-left text-sm hover:opacity-90 disabled:opacity-50"
                      >
                        <div className="font-semibold">{r.clienteNome || "Cliente"}</div>
                        <div className="text-xs text-slate-500">{r.pdvNome || "PDV"}</div>
                        <div className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {cadastroSecaoLabel(resolveCadastroSecao(r.payload))}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.clienteGatewayId != null ? `cli ${r.clienteGatewayId}` : ""}
                          {r.pdvGatewayId != null ? ` · pdv ${r.pdvGatewayId}` : ""}
                        </div>
                        {isProcessing ?
                          <div className="mt-1 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                            Vinculando…
                          </div>
                        : null}
                      </button>
                    </div>
                  </li>
                );
              })}
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
                {" · "}
                <span className="font-semibold">{cadastroSecaoLabel(selectedSecao)}</span>
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
                    <div className="text-slate-500">
                      Sem dados de {selectedSecao === "financeiro" ? "cobrança" : "loja"} neste envio.
                    </div>
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
                      `Nenhum dado de ${selectedSecao === "financeiro" ? "cobrança" : "loja"} no envio.`
                    : selectedSecao === "financeiro" ?
                      "Aplicar contatos de cobrança ao cadastro"
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
                    {(selectedSecao === "financeiro" ? COBRANCA_CADASTRO_FIELDS : LOJA_CADASTRO_FIELDS).map(
                      (field) => {
                        const value =
                          selectedSecao === "financeiro" ?
                            producaoFinanceiroValue(producao, field as CobrancaCadastroField)
                          : producaoLojaValue(producao, field as LojaCadastroField);
                        const label =
                          selectedSecao === "financeiro" ?
                            COBRANCA_FIELD_LABELS[field as CobrancaCadastroField]
                          : LOJA_FIELD_LABELS[field as LojaCadastroField];
                        return (
                          <div key={field}>
                            <dt className="text-[10px] font-bold uppercase text-slate-400">{label}</dt>
                            <dd className={value ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}>
                              {value || "—"}
                            </dd>
                          </div>
                        );
                      },
                    )}
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
