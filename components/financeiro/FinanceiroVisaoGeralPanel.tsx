"use client";

import { useCallback, useEffect, useState } from "react";
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
      setError("Erro de rede. A Conta Azul pode estar demorando — tente de novo em instantes.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando indicadores do Conta Azul…</p>;
  }

  if (notConnected) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="font-semibold text-amber-900 dark:text-amber-100">Conta Azul não conectado</p>
        <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
          Conecte a integração para ver os totais de receitas e atrasos.
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
          Conta Azul · competência {data.labels.mesAtual}
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
          sub={`Vencimento em ${data.labels.mesAtual}`}
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
          title="Total atrasados mês passado"
          value={formatBRL(c.atrasadoMesPassado)}
          sub={data.labels.mesPassado}
          tone="amber"
          icon="📉"
        />
        <KpiCard
          title="Total atrasados 2º mês passado"
          value={formatBRL(c.atrasadoSegundoMesPassado)}
          sub={data.labels.segundoMesPassado}
          tone="amber"
          icon="📉"
        />
        <KpiCard
          title="Total atrasados 3º mês passado"
          value={formatBRL(c.atrasadoTerceiroMesPassado)}
          sub={data.labels.terceiroMesPassado}
          tone="amber"
          icon="📉"
        />
        <KpiCard
          title="Previsão mês seguinte"
          value={formatBRL(c.previsaoMesSeguinte)}
          sub={`Total do período · ${data.labels.mesSeguinte}`}
          tone="emerald"
          icon="🔮"
        />
      </section>
    </div>
  );
}
