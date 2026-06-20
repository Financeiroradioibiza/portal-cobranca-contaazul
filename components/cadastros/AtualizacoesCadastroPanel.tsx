"use client";

import { useCallback, useEffect, useState } from "react";

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

const PAYLOAD_LABELS: Record<string, string> = {
  nome: "Nome PDV",
  cep: "CEP",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "UF",
  razaoSocial: "Razão social",
  razao_social: "Razão social",
  cnpj: "CNPJ",
  contatoLojaNome: "Contato loja",
  contato_loja_nome: "Contato loja",
  contatoLojaEmail: "E-mail loja",
  contato_loja_email: "E-mail loja",
  contatoLojaTelefone: "WhatsApp loja",
  contato_loja_telefone: "WhatsApp loja",
  contatoCobrancaNome: "Contato cobrança",
  contato_cobranca_nome: "Contato cobrança",
  contatoCobrancaEmail: "E-mail cobrança",
  contato_cobranca_email: "E-mail cobrança",
  contatoCobrancaTelefone: "Tel. cobrança",
  contato_cobranca_telefone: "Tel. cobrança",
};

const PRODUCAO_KEYS = [
  "nome",
  "cep",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "razaoSocial",
  "cnpj",
  "contatoLojaNome",
  "contatoLojaEmail",
  "contatoLojaTelefone",
  "contatoCobrancaNome",
  "contatoCobrancaEmail",
  "contatoCobrancaTelefone",
] as const;

function payloadEntries(payload: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (k === "form-name" || k.startsWith("feedback-bot")) continue;
    out.push([PAYLOAD_LABELS[k] ?? k, v.trim()]);
  }
  return out;
}

export function AtualizacoesCadastroPanel() {
  const [rows, setRows] = useState<IngestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [producao, setProducao] = useState<ProducaoDto | null>(null);
  const [linkKey, setLinkKey] = useState("");
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
      setSelectedId((prev) => prev ?? nextRows[0]?.id ?? null);
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
      const data = (await res.json()) as { row?: IngestRow; producao?: ProducaoDto | null };
      if (data.row) setLinkKey(data.row.rioPdvKey ?? "");
      setProducao(data.producao ?? null);
    } catch {
      setProducao(null);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function vincularPdv() {
    if (!selectedId || !linkKey.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cadastros/atualizacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action: "link", rioPdvKey: linkKey.trim() }),
      });
      if (!res.ok) throw new Error("link_failed");
      await loadDetail(selectedId);
      setMsg("PDV de produção vinculado.");
    } catch {
      setMsg("Falha ao vincular PDV.");
    } finally {
      setBusy(false);
    }
  }

  async function conciliar() {
    if (!selectedId) return;
    if (!window.confirm("Aplicar os dados enviados pelo player ao cadastro de produção?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cadastros/atualizacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action: "conciliar" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "conciliar_failed");
      setMsg("Cadastro conciliado e sincronizado.");
      await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao conciliar.");
    } finally {
      setBusy(false);
    }
  }

  const enviado = selected ? payloadEntries(selected.payload) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cadastros / Atl. cadastros</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Atualizações de cadastro</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Recebimentos do Player 5 — compare o que foi enviado com o cadastro de produção e concilie.
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
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Enviado pelo player</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {enviado.length === 0 ?
                  <div className="text-slate-500">Sem campos estruturados — ver payload bruto abaixo.</div>
                : (
                  enviado.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">{label}</dt>
                      <dd className="text-slate-800 dark:text-slate-100">{value}</dd>
                    </div>
                  ))
                )}
              </dl>
            </section>

            <div className="flex flex-col items-center justify-center gap-2 px-1">
              {!selected.rioPdvKey ?
                <>
                  <input
                    type="text"
                    value={linkKey}
                    onChange={(e) => setLinkKey(e.target.value)}
                    placeholder="rio_pdv_key"
                    className="w-full min-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    disabled={busy || !linkKey.trim()}
                    onClick={() => void vincularPdv()}
                    className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900"
                  >
                    Vincular PDV
                  </button>
                </>
              : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void conciliar()}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40"
                >
                  Conciliar →
                </button>
              )}
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Produção atual</h2>
              {!selected.rioPdvKey ?
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                  Vincule um PDV de produção (rio_pdv_key) para ver o cadastro atual.
                </p>
              : !producao ?
                <p className="mt-3 text-sm text-slate-500">Cadastro não encontrado — será criado ao conciliar.</p>
              : (
                <dl className="mt-3 space-y-2 text-sm">
                  {PRODUCAO_KEYS.map((k) => {
                    const v = producao[k];
                    if (typeof v !== "string" || !v.trim()) return null;
                    return (
                      <div key={k}>
                        <dt className="text-[10px] font-bold uppercase text-slate-400">{k}</dt>
                        <dd className="text-slate-800 dark:text-slate-100">{v}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </section>
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
