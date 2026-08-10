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

function horaToMin(h: string): number {
  const [hh, mm] = h.split(":").map((x) => parseInt(x, 10));
  return (hh ?? 0) * 60 + (mm ?? 0);
}

type Props = {
  clienteNome: string;
  blocos: SemanaBloco[];
  canExport: boolean;
};

export function SiteClienteSemanaChart({ clienteNome, blocos, canExport }: Props) {
  const pastas = [...new Set(blocos.map((b) => b.pastaNome))];
  const colorByPasta = new Map(pastas.map((p, i) => [p, COLORS[i % COLORS.length]!]));

  function exportPdf() {
    window.print();
  }

  return (
    <div className="site-cliente-semana-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Agenda da semana</h3>
        {canExport ? (
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20 print:hidden"
          >
            Exportar PDF
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 print:mb-4">
        {pastas.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-xs">
            <span className={`h-3 w-3 rounded ${colorByPasta.get(p)}`} />
            {p}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-2 print:border-zinc-300 print:bg-white">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-px text-[10px] text-white/40 print:text-zinc-500">
            <div />
            {DOW.map((d) => (
              <div key={d} className="py-1 text-center font-semibold">
                {d}
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-[48px_repeat(7,1fr)] gap-px" style={{ height: 288 }}>
            <div className="flex flex-col justify-between py-1 text-[9px] text-white/30 print:text-zinc-400">
              {HOURS.filter((h) => h % 4 === 0).map((h) => (
                <span key={h}>{String(h).padStart(2, "0")}:00</span>
              ))}
            </div>
            {DOW.map((_, dia) => (
              <div key={dia} className="relative rounded bg-white/5 print:bg-zinc-50">
                {blocos
                  .filter((b) => b.dia === dia)
                  .map((b, i) => {
                    const top = (horaToMin(b.horaInicio) / (24 * 60)) * 100;
                    const h =
                      ((horaToMin(b.horaFim) - horaToMin(b.horaInicio)) / (24 * 60)) * 100;
                    return (
                      <div
                        key={`${b.pastaNome}-${i}`}
                        className={`absolute inset-x-0.5 overflow-hidden rounded px-1 text-[9px] leading-tight text-white print:text-zinc-900 ${colorByPasta.get(b.pastaNome)}`}
                        style={{ top: `${top}%`, height: `${Math.max(h, 4)}%` }}
                        title={`${b.pastaNome} ${b.horaInicio}-${b.horaFim}`}
                      >
                        <span className="font-semibold">{b.pastaNome}</span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .site-cliente-semana-chart,
          .site-cliente-semana-chart * {
            visibility: visible;
          }
          .site-cliente-semana-chart {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            color: #111;
          }
          .site-cliente-semana-chart::before {
            content: "${clienteNome.replace(/"/g, "")} — Agenda semanal";
            display: block;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 12px;
            color: #111;
          }
        }
      `}</style>
    </div>
  );
}
