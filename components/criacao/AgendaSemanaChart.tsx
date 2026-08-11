"use client";

import type { SemanaBloco } from "@/lib/site-cliente/estiloAgora";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const COLORS = [
  "bg-fuchsia-500/80",
  "bg-cyan-500/80",
  "bg-amber-500/80",
  "bg-emerald-500/80",
  "bg-violet-500/80",
  "bg-rose-500/80",
  "bg-sky-500/80",
  "bg-lime-500/80",
];

const MINUTES_PER_DAY = 24 * 60;

function horaToMin(h: string): number {
  const [hh, mm] = h.split(":").map((x) => parseInt(x, 10));
  return (hh ?? 0) * 60 + (mm ?? 0);
}

/** Intervalos [ini, fim) em minutos — suporta faixa que cruza meia-noite. */
function intervalosMinutos(horaInicio: string, horaFim: string): Array<[number, number]> {
  const ini = horaToMin(horaInicio);
  let fim = horaToMin(horaFim);
  if (fim <= ini) fim += MINUTES_PER_DAY;
  if (fim <= MINUTES_PER_DAY) return [[ini, fim]];
  return [
    [ini, MINUTES_PER_DAY],
    [0, fim - MINUTES_PER_DAY],
  ];
}

type SegmentoDia = {
  topPct: number;
  heightPct: number;
  pastas: string[];
};

/**
 * Fatias verticais do dia em que o conjunto de pastas activas é constante;
 * cada fatia divide a largura entre todas as pastas simultâneas.
 */
function segmentosDoDia(blocos: SemanaBloco[]): SegmentoDia[] {
  const ranges: Array<{ ini: number; fim: number; pasta: string }> = [];
  for (const b of blocos) {
    for (const [ini, fim] of intervalosMinutos(b.horaInicio, b.horaFim)) {
      if (fim > ini) ranges.push({ ini, fim, pasta: b.pastaNome });
    }
  }
  if (ranges.length === 0) return [];

  const pontos = new Set<number>([0, MINUTES_PER_DAY]);
  for (const r of ranges) {
    pontos.add(r.ini);
    pontos.add(r.fim);
  }
  const ordenados = [...pontos].sort((a, b) => a - b);
  const out: SegmentoDia[] = [];

  for (let i = 0; i < ordenados.length - 1; i++) {
    const ini = ordenados[i]!;
    const fim = ordenados[i + 1]!;
    if (fim <= ini) continue;
    const meio = ini + (fim - ini) / 2;
    const activas = [
      ...new Set(ranges.filter((r) => meio >= r.ini && meio < r.fim).map((r) => r.pasta)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (activas.length === 0) continue;
    out.push({
      topPct: (ini / MINUTES_PER_DAY) * 100,
      heightPct: ((fim - ini) / MINUTES_PER_DAY) * 100,
      pastas: activas,
    });
  }
  return out;
}

export type AgendaSemanaChartProps = {
  blocos: SemanaBloco[];
  /** Título principal (ex.: «Agenda da semana»). */
  title?: string;
  /** Subtítulo no PDF / contexto (ex.: nome da programação). */
  exportLabel?: string;
  canExport?: boolean;
  /** portal = fundo claro do editor; dark = site do cliente. */
  theme?: "portal" | "dark";
  className?: string;
};

export function AgendaSemanaChart({
  blocos,
  title = "Agenda da semana",
  exportLabel = "",
  canExport = false,
  theme = "portal",
  className = "",
}: AgendaSemanaChartProps) {
  const pastas = [...new Set(blocos.map((b) => b.pastaNome))];
  const colorByPasta = new Map(pastas.map((p, i) => [p, COLORS[i % COLORS.length]!]));
  const dark = theme === "dark";

  const shell = dark
    ? "rounded-xl border border-white/10 bg-black/20"
    : "rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50";
  const headText = dark ? "text-white/40" : "text-slate-500";
  const hourText = dark ? "text-white/30" : "text-slate-400";
  const colBg = dark ? "bg-white/5" : "bg-white dark:bg-slate-800/80";
  const blockText = dark ? "text-white print:text-zinc-900" : "text-white";
  const titleCls = dark ? "font-semibold text-white" : "text-sm font-bold text-slate-700 dark:text-slate-200";
  const exportBtn = dark
    ? "rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 print:hidden"
    : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 print:hidden";

  function exportPdf() {
    window.print();
  }

  const printTitle = exportLabel.trim() || title;

  return (
    <div className={`agenda-semana-chart ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className={titleCls}>{title}</h3>
        {canExport ? (
          <button type="button" onClick={exportPdf} className={exportBtn}>
            Exportar PDF
          </button>
        ) : null}
      </div>

      {pastas.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 print:mb-4">
          {pastas.map((p) => (
            <span
              key={p}
              className={`inline-flex items-center gap-1 text-xs ${dark ? "text-white/80" : "text-slate-600 dark:text-slate-300"}`}
            >
              <span className={`h-3 w-3 rounded ${colorByPasta.get(p)}`} />
              {p}
            </span>
          ))}
        </div>
      ) : (
        <p className={`mb-3 text-xs ${dark ? "text-white/50" : "text-slate-500"}`}>
          Nenhuma regra de pasta no cronograma ainda.
        </p>
      )}

      <div className={`overflow-x-auto p-2 print:border-zinc-300 print:bg-white ${shell}`}>
        <div className="min-w-[640px]">
          <div className={`grid grid-cols-[48px_repeat(7,1fr)] gap-px text-[10px] ${headText} print:text-zinc-500`}>
            <div />
            {DOW.map((d) => (
              <div key={d} className="py-1 text-center font-semibold">
                {d}
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-[48px_repeat(7,1fr)] gap-px" style={{ height: 288 }}>
            <div className={`flex flex-col justify-between py-1 text-[9px] ${hourText} print:text-zinc-400`}>
              {HOURS.filter((h) => h % 4 === 0).map((h) => (
                <span key={h}>{String(h).padStart(2, "0")}:00</span>
              ))}
            </div>
            {DOW.map((_, dia) => (
              <div key={dia} className={`relative rounded print:bg-zinc-50 ${colBg}`}>
                {segmentosDoDia(blocos.filter((b) => b.dia === dia)).flatMap((seg, si) =>
                  seg.pastas.map((pastaNome, col) => {
                    const n = seg.pastas.length;
                    const gap = n > 1 ? 0.4 : 0;
                    const widthPct = 100 / n - gap;
                    const leftPct = col * (100 / n) + gap / 2;
                    const showLabel = seg.heightPct >= 2.5;
                    return (
                      <div
                        key={`${si}-${pastaNome}`}
                        className={`absolute overflow-hidden rounded px-0.5 text-[8px] leading-tight ${blockText} ${colorByPasta.get(pastaNome)}`}
                        style={{
                          top: `${seg.topPct}%`,
                          height: `${Math.max(seg.heightPct, 0.8)}%`,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                        title={pastaNome}
                      >
                        {showLabel ? (
                          <span className="block truncate font-semibold">{pastaNome}</span>
                        ) : null}
                      </div>
                    );
                  }),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {canExport ? (
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .agenda-semana-chart,
            .agenda-semana-chart * {
              visibility: visible;
            }
            .agenda-semana-chart {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              color: #111;
            }
            .agenda-semana-chart::before {
              content: "${printTitle.replace(/"/g, "")} — Agenda semanal";
              display: block;
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 12px;
              color: #111;
            }
          }
        `}</style>
      ) : null}
    </div>
  );
}
