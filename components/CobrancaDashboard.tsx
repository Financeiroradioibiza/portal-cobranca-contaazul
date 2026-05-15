"use client";

import { useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMPANY_NAME } from "@/lib/brand";
import { defaultPeriodMonths, formatBRL } from "@/lib/format";
import type { ClientRow } from "@/lib/types";

type ConnStatus = {
  connected: boolean;
  expiresAt?: string;
  error?: string;
};

export function CobrancaDashboard() {
  const initial = defaultPeriodMonths(6);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [status, setStatus] = useState<ConnStatus | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [parcelaBusy, setParcelaBusy] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/contaazul/status");
      const data = (await res.json()) as ConnStatus;
      setStatus(data);
    } catch {
      setStatus({ connected: false, error: "Falha ao consultar status." });
    }
  }, []);

  const loadReceivables = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const q = new URLSearchParams({ start, end });
      const res = await fetch(`/api/contaazul/receivables?${q}`);
      const data = (await res.json()) as {
        clients?: ClientRow[];
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setClients([]);
          setFetchError(null);
          await loadStatus();
          setLoading(false);
          return;
        }
        throw new Error(data.error || `Erro ${res.status}`);
      }
      setClients(data.clients ?? []);
      setLastRefresh(new Date());
    } catch (e) {
      setClients([]);
      setFetchError(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [start, end, loadStatus]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadStatus();
    });
  }, [loadStatus]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("connected");
    const err = sp.get("oauth_error");
    queueMicrotask(() => {
      if (c === "1") {
        setOauthBanner("Conta Azul conectada com sucesso.");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (err) {
        setOauthBanner(`OAuth: ${decodeURIComponent(err)}`);
        window.history.replaceState({}, "", window.location.pathname);
      }
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (status?.connected) {
        void loadReceivables();
      } else {
        setClients([]);
      }
    });
  }, [status?.connected, loadReceivables]);

  const onRefresh = useCallback(() => {
    void (async () => {
      await loadStatus();
      await loadReceivables();
    })();
  }, [loadStatus, loadReceivables]);

  const onDefaultPeriod = useCallback(() => {
    const p = defaultPeriodMonths(6);
    setStart(p.start);
    setEnd(p.end);
  }, []);

  const onDisconnect = useCallback(async () => {
    await fetch("/api/contaazul/disconnect", { method: "POST" });
    setClients([]);
    setOauthBanner(null);
    await loadStatus();
  }, [loadStatus]);

  const onPortalLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  const openParcelaLink = useCallback(async (parcelaId: string, tipo: "boleto" | "nf") => {
    const busyKey = `${parcelaId}:${tipo}`;
    setActionMsg(null);
    setParcelaBusy(busyKey);
    try {
      const url = `/api/contaazul/parcela/${encodeURIComponent(parcelaId)}/file?tipo=${tipo}`;
      const res = await fetch(url, { credentials: "include", redirect: "manual" });

      if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
        const loc = res.headers.get("Location");
        if (loc) {
          window.open(loc, "_blank", "noopener,noreferrer");
          return;
        }
      }

      if (!res.ok) {
        const t = (await res.text()).trim();
        setActionMsg(t.slice(0, 500) || "Não foi possível abrir o documento.");
        return;
      }

      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          const j = (await res.json()) as { message?: string; error?: string };
          setActionMsg(j.message || j.error || "Resposta inesperada da API.");
        } catch {
          setActionMsg("Resposta inesperada da API.");
        }
        return;
      }

      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      window.open(obj, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(obj), 120_000);
    } catch {
      setActionMsg("Falha ao abrir o documento. Tente de novo.");
    } finally {
      setParcelaBusy(null);
    }
  }, []);

  const patchClientMeta = useCallback(
    async (clientId: string, body: { hasActiveContract?: boolean; note?: string }) => {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setActionMsg("Não foi possível salvar dados do cliente.");
          return;
        }
        const data = (await res.json()) as {
          hasActiveContract: boolean;
          note: string;
        };
        setActionMsg(null);
        setClients((prev) =>
          prev.map((c) =>
            c.id === clientId
              ? { ...c, hasActiveContract: data.hasActiveContract, note: data.note }
              : c,
          ),
        );
      } catch {
        setActionMsg("Falha ao salvar. Verifique a conexão.");
      }
    },
    [],
  );

  const connected = Boolean(status?.connected);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {oauthBanner ? (
        <div
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
          role="status"
        >
          {oauthBanner}
        </div>
      ) : null}

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0066cc] dark:text-sky-400">
            {COMPANY_NAME}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cobrança — parcelas vencidas em aberto
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Ordenado do maior para o menor número de vendas vencidas e em aberto.
            Fonte: API Conta Azul (contas a receber + cadastro de pessoas).
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            Período (vencimento): {start} a {end}. Apenas parcelas com vencimento{" "}
            <strong>antes de hoje</strong> e valor em aberto.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ThemeToggle />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {connected ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
                  aria-hidden
                />
                Conectado ao Conta Azul
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Não conectado
              </span>
            )}
            {connected ? (
              <a
                href="/api/contaazul/login"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Reautorizar
              </a>
            ) : (
              <a
                href="/api/contaazul/login"
                className="rounded-lg bg-[#0066cc] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 dark:bg-sky-600"
              >
                Conectar Conta Azul
              </a>
            )}
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              className="rounded-lg bg-[#0066cc] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 dark:bg-sky-600"
            >
              {loading ? "Carregando…" : "Atualizar"}
            </button>
            {connected ? (
              <button
                type="button"
                onClick={() => void onDisconnect()}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Desconectar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onPortalLogout()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sair do portal
            </button>
          </div>
        </div>
      </header>

      {status?.error && !status.connected ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Banco / configuração: {status.error}. Verifique{" "}
          <code className="rounded bg-white/50 px-1 dark:bg-black/30">DATABASE_URL</code> na
          Netlify.
        </p>
      ) : null}

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-500">
        {lastRefresh
          ? `Última atualização: ${lastRefresh.toLocaleString("pt-BR")}`
          : "Nenhuma atualização ainda."}
        {status?.expiresAt
          ? ` · Token válido até ~ ${new Date(status.expiresAt).toLocaleString("pt-BR")}`
          : null}
      </p>

      {fetchError ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {fetchError}
        </p>
      ) : null}

      {actionMsg ? (
        <p
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
          role="status"
        >
          {actionMsg}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="d0"
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
          >
            Período — início
          </label>
          <input
            id="d0"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            htmlFor="d1"
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
          >
            Período — fim
          </label>
          <input
            id="d1"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={onDefaultPeriod}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Últimos 6 meses (padrão)
        </button>
        <a
          href="/prototype.html"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0066cc] hover:bg-slate-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-slate-900"
        >
          Ver protótipo HTML
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          {connected
            ? "Dados da API: um cliente = uma linha. Parcelas à esquerda; observação fixa à direita (role a tabela se precisar)."
            : "Conecte o Conta Azul para carregar receitas. Cadastre OAuth e Postgres nas variáveis de ambiente."}
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                <th className="px-2 py-2">Nome fantasia</th>
                <th className="px-2 py-2 whitespace-nowrap">CNPJ</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Nº vendas</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Total aberto</th>
                <th className="px-2 py-2 max-w-[10rem]">E-mail</th>
                <th className="px-2 py-2 whitespace-nowrap">Contrato</th>
                <th className="px-2 py-2 min-w-[12rem] max-w-[22rem]">
                  Parcelas · boleto / NF
                </th>
                <th className="sticky right-0 z-20 min-w-[11rem] max-w-[14rem] border-l border-slate-200 bg-slate-50 px-2 py-2 shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.12)] dark:border-slate-600 dark:bg-slate-800 dark:shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.35)]">
                  Observação
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                  >
                    {connected
                      ? "Nenhum cliente com parcelas vencidas em aberto nesse período."
                      : "Clique em “Conectar Conta Azul” para autorizar o acesso."}
                  </td>
                </tr>
              ) : null}
              {clients.map((c, clientIndex) => {
                const total = c.sales.reduce((s, x) => s + x.value, 0);
                const stripe =
                  clientIndex % 2 === 0
                    ? "bg-white dark:bg-slate-900"
                    : "bg-slate-100 dark:bg-slate-800";
                const stickyObs = `sticky right-0 z-10 border-l border-slate-200 shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.1)] dark:border-slate-600 dark:shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.3)] ${stripe}`;

                return (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-200/90 align-top dark:border-slate-800 ${stripe}`}
                  >
                    <td
                      className="max-w-[9rem] px-2 py-1 align-middle"
                      title={c.fantasy}
                    >
                      <span className="line-clamp-2 font-semibold text-[#0066cc] dark:text-sky-400">
                        {c.fantasy}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 align-middle tabular-nums text-slate-700 dark:text-slate-300">
                      {c.cnpj}
                    </td>
                    <td className="px-2 py-1 text-right align-middle tabular-nums text-slate-900 dark:text-slate-100">
                      {c.sales.length}
                    </td>
                    <td className="px-2 py-1 text-right align-middle tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatBRL(total)}
                    </td>
                    <td
                      className="max-w-[9rem] truncate px-2 py-1 align-middle text-[0.65rem]"
                      title={c.email !== "—" ? c.email : undefined}
                    >
                      {c.email !== "—" ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-[#0066cc] hover:underline dark:text-sky-400"
                        >
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 align-middle whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          void patchClientMeta(c.id, {
                            hasActiveContract: !c.hasActiveContract,
                          })
                        }
                        className={
                          c.hasActiveContract
                            ? "rounded px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            : "rounded border border-slate-300 bg-white px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        }
                      >
                        {c.hasActiveContract ? "Ativo" : "Sem contrato"}
                      </button>
                    </td>
                    <td className="min-w-[12rem] max-w-[24rem] px-2 py-1 align-middle">
                      <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
                        {c.sales.map((s) => {
                          const boletoBusy =
                            parcelaBusy === `${s.id}:boleto`;
                          const nfBusy = parcelaBusy === `${s.id}:nf`;
                          return (
                            <div
                              key={s.id}
                              className="flex w-[9.5rem] flex-none snap-start flex-col gap-0.5 rounded border border-slate-200 bg-white/90 px-1.5 py-1 dark:border-slate-600 dark:bg-slate-950/60"
                              title={s.summary}
                            >
                              <div className="whitespace-nowrap text-[0.6rem] leading-tight text-slate-600 dark:text-slate-400">
                                {s.due} · {formatBRL(s.value)}
                              </div>
                              <div className="flex gap-0.5">
                                <button
                                  type="button"
                                  disabled={Boolean(parcelaBusy)}
                                  onClick={() =>
                                    void openParcelaLink(s.id, "boleto")
                                  }
                                  className="flex-1 rounded border border-slate-300 bg-slate-50 py-0.5 text-[0.65rem] font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                                  title="Boleto / pagamento"
                                >
                                  {boletoBusy ? "…" : "Boleto"}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(parcelaBusy)}
                                  onClick={() => void openParcelaLink(s.id, "nf")}
                                  className="flex-1 rounded border border-slate-300 bg-slate-50 py-0.5 text-[0.65rem] font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                                  title="Nota / documento"
                                >
                                  {nfBusy ? "…" : "Nota"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className={`px-2 py-1 align-middle ${stickyObs}`}>
                      <textarea
                        rows={2}
                        value={c.note}
                        onChange={(e) => {
                          const v = e.target.value;
                          setClients((prev) =>
                            prev.map((x) =>
                              x.id === c.id ? { ...x, note: v } : x,
                            ),
                          );
                        }}
                        onBlur={(e) =>
                          void patchClientMeta(c.id, { note: e.target.value })
                        }
                        placeholder="Nota interna…"
                        className="box-border w-full min-h-[2.75rem] max-w-full resize-y rounded border border-slate-300 bg-white px-1.5 py-1 text-[0.65rem] leading-snug text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        autoComplete="off"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="mt-8 text-xs text-slate-500 dark:text-slate-500">
        {COMPANY_NAME} — variáveis:{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">DATABASE_URL</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">CONTA_AZUL_CLIENT_ID</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">CONTA_AZUL_CLIENT_SECRET</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">CONTA_AZUL_REDIRECT_URI</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">NEXT_PUBLIC_SITE_URL</code>.
      </footer>
    </div>
  );
}