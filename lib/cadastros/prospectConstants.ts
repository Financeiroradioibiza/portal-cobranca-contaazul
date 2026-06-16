import type { ProspectEstagio } from "@prisma/client";

export const PROSPECT_COLUNAS: {
  id: ProspectEstagio;
  label: string;
  icon: string;
  badge: string;
  header: string;
}[] = [
  {
    id: "lead",
    label: "Lead",
    icon: "🆕",
    badge: "bg-sky-500 text-white",
    header: "border-sky-200 bg-sky-50/80 dark:border-sky-900 dark:bg-sky-950/30",
  },
  {
    id: "em_contato",
    label: "Em contato",
    icon: "📞",
    badge: "bg-amber-500 text-white",
    header: "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30",
  },
  {
    id: "demo_enviada",
    label: "Demo enviada",
    icon: "🎯",
    badge: "bg-violet-500 text-white",
    header: "border-violet-200 bg-violet-50/80 dark:border-violet-900 dark:bg-violet-950/30",
  },
  {
    id: "fechado",
    label: "Fechados",
    icon: "✅",
    badge: "bg-emerald-500 text-white",
    header: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30",
  },
];

export function formatProspectValor(centavos: number): string {
  const reais = centavos / 100;
  if (reais >= 1000) {
    const k = reais / 1000;
    const txt = k >= 10 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, "");
    return `R$ ${txt}K`;
  }
  if (reais <= 0) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(reais);
}

export function parseValorReaisInput(raw: string): number {
  const t = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function centavosToReaisInput(centavos: number): string {
  if (centavos <= 0) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function prospectLocalLabel(cidade: string, estado: string, unidades: number): string {
  const loc =
    cidade.trim() && estado.trim() ?
      `${cidade.trim()}/${estado.trim().toUpperCase()}`
    : cidade.trim() || estado.trim().toUpperCase() || "—";
  const u = unidades === 1 ? "1 unidade" : `${unidades} unidades`;
  return `${loc} · ${u}`;
}
