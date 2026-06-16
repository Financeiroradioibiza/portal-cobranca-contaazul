import type { ChamadoPrioridade, ChamadoStatus } from "@prisma/client";

export const CHAMADO_SETORES = [
  { id: "financeiro", label: "Financeiro", color: "#8b5cf6", bg: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  { id: "suporte", label: "Suporte", color: "#0ea5e9", bg: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  { id: "cadastros", label: "Cadastros", color: "#10b981", bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  { id: "producao", label: "Produção", color: "#f59e0b", bg: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  { id: "criacao", label: "Criação", color: "#ec4899", bg: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200" },
  { id: "relacionamento", label: "Relacionamento", color: "#14b8a6", bg: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200" },
  { id: "admin", label: "Administração", color: "#6366f1", bg: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200" },
  { id: "geral", label: "Geral", color: "#64748b", bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
] as const;

export type ChamadoSetorId = (typeof CHAMADO_SETORES)[number]["id"];

export const CHAMADO_PRIORIDADES: {
  id: ChamadoPrioridade;
  label: string;
  ring: string;
  dot: string;
}[] = [
  { id: "baixa", label: "Baixa", ring: "ring-slate-300", dot: "bg-slate-400" },
  { id: "media", label: "Média", ring: "ring-sky-400", dot: "bg-sky-500" },
  { id: "alta", label: "Alta", ring: "ring-amber-400", dot: "bg-amber-500" },
  { id: "urgente", label: "Urgente", ring: "ring-rose-500", dot: "bg-rose-600" },
];

export const CHAMADO_COLUNAS: {
  id: ChamadoStatus;
  label: string;
  header: string;
  column: string;
}[] = [
  {
    id: "aberto",
    label: "Aberto",
    header: "border-sky-300 bg-gradient-to-b from-sky-50 to-white dark:from-sky-950/40 dark:to-slate-900",
    column: "border-sky-200/80 dark:border-sky-900/50",
  },
  {
    id: "em_andamento",
    label: "Em andamento",
    header: "border-amber-300 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900",
    column: "border-amber-200/80 dark:border-amber-900/50",
  },
  {
    id: "fechado",
    label: "Resolvido",
    header: "border-emerald-300 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900",
    column: "border-emerald-200/80 dark:border-emerald-900/50",
  },
];

export function setorMeta(id: string) {
  return CHAMADO_SETORES.find((s) => s.id === id) ?? CHAMADO_SETORES.find((s) => s.id === "geral")!;
}

export function prioridadeMeta(id: ChamadoPrioridade) {
  return CHAMADO_PRIORIDADES.find((p) => p.id === id) ?? CHAMADO_PRIORIDADES[1]!;
}
