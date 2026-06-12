"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProducaoClienteDrawer } from "@/components/producao/ProducaoClienteDrawer";
import type {
  DashboardClienteDetail,
  DashboardClienteRow,
  ProducaoDashboardPayload,
} from "@/lib/cadastros/producaoDashboardService";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
} from "@/lib/manualReminders/yearMonth";

type MonthMeta = { id: string; yearMonth: number };

function fmtPing(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function DownloadBar({ percent }: { percent: number | null }) {
  const p = percent ?? 0;
  const label = percent == null ? "—" : `${Math.round(p)}%`;
  return (
    <div className="min-w-[100px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-fuchsia-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  );
}

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
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const vigenteYm = useMemo(
    () => pickVigenteRioYearMonth(months, todayYm),
    [months, todayYm],
  );
  const [data, setData] = useState<ProducaoDashboardPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [clienteDetail, setClienteDetail] = useState<DashboardClienteDetail | null>(null);

  const load = useCallback(async (ym: number) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/producao/dashboard?ym=${ym}`);
      const json = (await res.json()) as ProducaoDashboardPayload & { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setData(json);
      setExpanded(new Set());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar dashboard.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/rio-planilha/clientes/months")
      .then((r) => r.json())
      .then((d: { months?: MonthMeta[] }) => {
        setMonths(d.months ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void load(vigenteYm);
  }, [vigenteYm, load]);

  const filtered = useMemo(() => {
    const list = data?.clientes ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => {
      const blob = `${c.nome} ${c.pdvs.map((p) => p.nome).join(" ")}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [data?.clientes, q]);

  function expandAll() {
    setExpanded(new Set(filtered.map((c) => c.key)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function toggleCliente(key: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

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
        <span
          className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-semibold text-violet-900 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100"
          title="Dashboard usa a competência vigente da Planilha Rio"
        >
          Vigente: {formatYearMonthLabel(vigenteYm)}
        </span>
      </header>

      {msg ?
        <p className="mb-3 text-sm text-rose-700 dark:text-rose-400">{msg}</p>
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
          value="—"
          sub="Módulo em breve"
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

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-[#faf8f5] shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#f5f0e8] px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wide">
            <span>
              Total{" "}
              <span className="text-slate-900 dark:text-white">{ov?.totalPdvs ?? 0} PDVs</span>
            </span>
            <span>
              Online{" "}
              <span className="text-emerald-600">{ov?.onlinePdvs ?? 0}</span>
            </span>
            <span>
              Offline{" "}
              <span className="text-amber-600">{ov?.offlinePdvs ?? 0}</span>
            </span>
            <span>
              Cache médio{" "}
              <span className="text-fuchsia-700 dark:text-fuchsia-400">—</span>
            </span>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-600"
              onClick={expandAll}
            >
              ▾ Expandir todos
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-600"
              onClick={collapseAll}
            >
              ▸ Recolher todos
            </button>
            <input
              type="search"
              placeholder="Buscar…"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[calc(100vh-28rem)] overflow-y-auto">
          {busy && !data ?
            <p className="p-4 text-sm text-slate-500">Carregando…</p>
          : filtered.length === 0 ?
            <p className="p-4 text-sm text-slate-500">Nenhum cliente na produção nesta competência.</p>
          : filtered.map((c) => (
              <ClienteBlock
                key={c.key}
                cliente={c}
                open={expanded.has(c.key)}
                onToggle={() => toggleCliente(c.key)}
                onOpenDetail={() => setClienteDetail(c.detail)}
              />
            ))
          }
        </div>

        <p className="border-t border-dashed border-amber-200 bg-amber-50/80 px-4 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Padrão fechado para performance. Com muitos PDVs, abrir tudo automático relenta o scroll.
          Use os botões para controlar manualmente.
        </p>
      </section>

      <ProducaoClienteDrawer detail={clienteDetail} onClose={() => setClienteDetail(null)} />
    </div>
  );
}

function ClienteBlock({
  cliente,
  open,
  onToggle,
  onOpenDetail,
}: {
  cliente: DashboardClienteRow;
  open: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-white/60 dark:hover:bg-slate-800/40">
        <button
          type="button"
          className="text-slate-400"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="text-slate-400">📁</span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-sm font-bold text-slate-900 hover:text-fuchsia-800 dark:text-white dark:hover:text-fuchsia-300"
          onClick={onOpenDetail}
        >
          {cliente.nome}
          {cliente.isCustom ?
            <span className="ms-1 text-[10px] font-normal text-violet-600">· manual</span>
          : null}
        </button>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
          {cliente.onlineCount > 0 ?
            <span>
              <span className="text-emerald-500">●</span> {cliente.onlineCount} online
            </span>
          : null}
          {cliente.offlineCount > 0 ?
            <span>
              <span className="text-amber-500">●</span> {cliente.offlineCount} offline
            </span>
          : null}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {cliente.pdvCount} PDVs
          </span>
        </div>
      </div>

      {open ?
        <div className="bg-white/50 pb-2 ps-10 pe-4 dark:bg-slate-900/30">
          <div className="mb-1 hidden grid-cols-[1fr_100px_120px_90px_100px_100px] gap-2 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 lg:grid">
            <span>PDV</span>
            <span>Cache</span>
            <span>Programação</span>
            <span>Versão player</span>
            <span>1º ping</span>
            <span>Último ping</span>
          </div>
          {cliente.pdvs.map((p) => (
            <div
              key={p.rioPdvKey}
              className="mb-1 grid gap-2 rounded-md border border-slate-100 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1fr_100px_120px_90px_100px_100px] lg:items-center"
            >
              <div className="min-w-0">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{p.nome}</span>
                {p.rioLinhaNome !== cliente.nome ?
                  <span className="ms-1 text-[10px] text-slate-400">· {p.rioLinhaNome}</span>
                : null}
                <span
                  className={
                    "ms-2 text-[10px] " +
                    (p.statusPlayer === "Ativo" ? "text-emerald-600" : "text-slate-400")
                  }
                >
                  {p.statusPlayer}
                </span>
              </div>
              <DownloadBar percent={p.telemetry.downloadPercent} />
              <span className="text-slate-700 dark:text-slate-300">{p.programacaoMusical}</span>
              <span className="text-slate-500">{p.telemetry.playerVersion ?? "—"}</span>
              <span className="text-slate-500">{fmtPing(p.telemetry.firstPingAt)}</span>
              <span className="text-slate-500">{fmtPing(p.telemetry.lastPingAt)}</span>
            </div>
          ))}
        </div>
      : null}
    </div>
  );
}
