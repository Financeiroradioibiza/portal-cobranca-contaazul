"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FinanceiroOverviewPayload } from "@/lib/financeiro/financeiroOverviewService";
import { formatBRL } from "@/lib/format";

function KpiCard({
  title,
  value,
  sub,
  tone,
  icon,
}: {
  title: string;
  value: string;
  sub?: string;
  tone: "blue" | "violet" | "amber" | "rose" | "emerald" | "sky";
  icon: string;
}) {
  const tones = {
    blue: "from-sky-500 to-sky-600",
    violet: "from-violet-500 to-violet-600",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-rose-600",
    emerald: "from-emerald-500 to-teal-600",
    sky: "from-cyan-500 to-blue-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-lg text-white " +
            tones[tone]
          }
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
          {sub ?
            <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
          : null}
        </div>
      </div>
    </div>
  );
}

export function FinanceiroVisaoGeralPanel() {
  const [data, setData] = useState<FinanceiroOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConnected(false);
    try {
      const res = await fetch("/api/financeiro/visao-geral", { credentials: "same-origin" });
      const json = await res.json();
      if (res.status === 401 && json.error === "not_connected") {
        setNotConnected(true);
        setData(null);
        return;
      }
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Erro ao carregar dados.");
        setData(null);
        return;
      }
      setData(json as FinanceiroOverviewPayload);
    } catch {
      setError("Erro de rede.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chartMax = useMemo(() => {
    if (!data?.chartMensal.length) return 1;
    return Math.max(1, ...data.chartMensal.map((m) => m.totalPeriodo));
  }, [data]);

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando visão geral do Conta Azul…</p>;
  }

  if (notConnected) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="font-semibold text-amber-900 dark:text-amber-100">Conta Azul não conectado</p>
        <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
          Conecte a integração para ver receitas, atrasos e previsões.
        </p>
        <a
          href="/api/contaazul/login"
          className="mt-3 inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Conectar Conta Azul →
        </a>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
        <p className="text-sm text-rose-800 dark:text-rose-200">{error ?? "Dados indisponíveis."}</p>
        <button type="button" onClick={() => void load()} className="mt-2 text-sm font-semibold text-rose-700 underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  const c = data.cards;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Dados do Conta Azul · competência {data.labels.mesAtual}
          {data.fetchedAt ?
            <> · atualizado {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(data.fetchedAt))}</>
          : null}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-600"
        >
          Atualizar
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total previsto no mês"
          value={formatBRL(c.totalPrevistoMes)}
          sub={data.labels.mesAtual}
          tone="blue"
          icon="📅"
        />
        <KpiCard
          title="Receitas em aberto no mês"
          value={formatBRL(c.receitasAbertoMes)}
          sub="Saldo a receber com vencimento neste mês"
          tone="violet"
          icon="💳"
        />
        <KpiCard
          title="Atrasado últimos 30 dias"
          value={formatBRL(c.atrasadoUltimos30Dias)}
          sub="Vencido e em aberto"
          tone="rose"
          icon="⏰"
        />
        <KpiCard
          title="Previsão mês seguinte"
          value={formatBRL(c.previsaoMesSeguinte)}
          sub={data.labels.mesSeguinte}
          tone="emerald"
          icon="🔮"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          title="Atrasados mês passado"
          value={formatBRL(c.atrasadoMesPassado)}
          sub={data.labels.mesPassado}
          tone="amber"
          icon="📉"
        />
        <KpiCard
          title="Atrasados 2º mês passado"
          value={formatBRL(c.atrasadoSegundoMesPassado)}
          sub={data.labels.segundoMesPassado}
          tone="amber"
          icon="📉"
        />
        <KpiCard
          title="Atrasados 3º mês passado"
          value={formatBRL(c.atrasadoTerceiroMesPassado)}
          sub={data.labels.terceiroMesPassado}
          tone="amber"
          icon="📉"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Top 5 clientes em aberto (últimos 6 meses)
          </p>
        </div>
        {data.topDevedores.length === 0 ?
          <p className="p-4 text-sm text-slate-500">Nenhuma cobrança em aberto no período.</p>
        : <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">CNPJ</th>
                  <th className="px-4 py-2 text-right">Parcelas</th>
                  <th className="px-4 py-2 text-right">Total em aberto</th>
                </tr>
              </thead>
              <tbody>
                {data.topDevedores.map((row, i) => (
                  <tr
                    key={row.clientId}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="px-4 py-2.5">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-100 text-[10px] font-bold text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300">
                        {i + 1}
                      </span>
                      {row.nome}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{row.cnpj}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.parcelas}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {formatBRL(row.totalAberto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        <div className="border-t border-slate-200 px-4 py-2 dark:border-slate-700">
          <Link href="/financeiro/vencidos" className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400">
            Ver todos os vencidos →
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Total do período — últimos 12 meses
        </p>
        <p className="mb-4 text-xs text-slate-500">Soma das parcelas a receber por mês de vencimento (Conta Azul)</p>
        <div className="flex h-44 items-end gap-1.5 rounded-lg bg-slate-50 px-2 py-3 dark:bg-slate-800/50">
          {data.chartMensal.map((m) => {
            const pct = Math.max(4, Math.round((m.totalPeriodo / chartMax) * 100));
            return (
              <div key={m.ym} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[9px] font-semibold tabular-nums text-slate-500">
                  {m.totalPeriodo >= 1000 ?
                    `${Math.round(m.totalPeriodo / 1000)}k`
                  : Math.round(m.totalPeriodo)}
                </span>
                <div
                  className="w-full max-w-[28px] rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-400 transition-all"
                  style={{ height: `${pct}%` }}
                  title={`${m.label}: ${formatBRL(m.totalPeriodo)}`}
                />
                <span className="truncate text-[8px] uppercase text-slate-400">{m.label.split("/")[0]}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
