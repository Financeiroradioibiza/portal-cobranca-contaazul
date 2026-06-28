"use client";

import { useCallback, useEffect, useState } from "react";
import { ChamadosBoard } from "@/components/chamados/ChamadosBoard";
import { useOpenChamadosCount } from "@/components/chamados/ChamadosDashboardWidget";
import type { ProducaoDashboardPayload } from "@/lib/cadastros/producaoDashboardService";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

function OverviewCard({
  title,
  value,
  sub,
  subTone = "muted",
  icon,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  subTone?: "muted" | "good" | "warn" | "bad";
  icon: string;
  tone: "green" | "blue" | "purple" | "orange";
}) {
  const tones = {
    green: "bg-emerald-500",
    blue: "bg-sky-500",
    purple: "bg-violet-500",
    orange: "bg-amber-500",
  };
  const subColors = {
    muted: "text-slate-500",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-white " +
            tones[tone]
          }
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className={"text-xs " + subColors[subTone]}>{sub}</p>
        </div>
      </div>
    </div>
  );
}

export function ProducaoDashboardPanel() {
  const openChamadosCount = useOpenChamadosCount();
  const [data, setData] = useState<ProducaoDashboardPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/producao/dashboard");
      const json = (await res.json()) as ProducaoDashboardPayload & { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setData(json);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar dashboard.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ov = data?.overview;

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dashboard</p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Visão geral do portal
          </h1>
        </div>
        {data?.rioSourceYearMonth != null ?
          <span
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            title="Nomes Rio vêm de competência fixa; produção não segue virada automática"
          >
            Espelho Rio: {formatYearMonthLabel(data.rioSourceYearMonth)}
          </span>
        : null}
      </header>

      {msg ?
        <p className="mb-3 text-sm text-rose-700 dark:text-rose-400">{msg}</p>
      : null}
      {busy && !data ?
        <p className="mb-3 text-sm text-slate-500">Carregando resumo…</p>
      : null}

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="PDVs ativos"
          value={ov ? `${ov.onlinePdvs}/${ov.totalPdvs}` : "—"}
          sub={ov && ov.semPingPdvs > 0 ? `${ov.semPingPdvs} sem ping` : "Base cadastro produção"}
          subTone={ov && ov.semPingPdvs > 0 ? "bad" : "muted"}
          icon="📻"
          tone="green"
        />
        <OverviewCard
          title="Pings/dia"
          value="—"
          sub="Telemetria em breve"
          icon="⚡"
          tone="blue"
        />
        <OverviewCard
          title="Vinhetas geradas"
          value="—"
          sub="Módulo em breve"
          icon="🎙"
          tone="purple"
        />
        <OverviewCard
          title="Chamados abertos"
          value={openChamadosCount == null ? "—" : String(openChamadosCount)}
          sub={openChamadosCount === 0 ? "Nada pendente para você" : "Seus setores e responsabilidades"}
          subTone={openChamadosCount != null && openChamadosCount > 0 ? "warn" : "muted"}
          icon="🎫"
          tone="orange"
        />
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Pings nas últimas 24h
          </p>
          <span className="text-[10px] text-slate-400">Em breve — gateway players</span>
        </div>
        <div className="flex h-24 items-end justify-between gap-1 rounded-lg bg-slate-50 px-2 py-3 dark:bg-slate-800/50">
          {[0, 6, 12, 18, 24].map((h) => (
            <div key={h} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full max-w-[24px] rounded-t bg-fuchsia-200/60 dark:bg-fuchsia-900/40" style={{ height: 8 }} />
              <span className="text-[9px] text-slate-400">{h === 24 ? "24H" : `${h}H`}</span>
            </div>
          ))}
        </div>
      </section>

      <ChamadosBoard scope="mine" embedded />
    </div>
  );
}
