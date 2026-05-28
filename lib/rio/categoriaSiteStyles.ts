/** Categorias do site (coluna na Planilha Rio). */
export const RIO_CATEGORIA_OPTS = [
  "",
  "moda",
  "shopping",
  "hotelaria",
  "hotel",
  "clinicas",
  "gastronomia",
  "outro",
] as const;

const STYLES: Record<
  string,
  { select: string; option: string; label: string }
> = {
  moda: {
    select:
      "border-rose-500/75 bg-rose-100 text-rose-950 font-semibold shadow-sm dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-50",
    option: "bg-rose-100 text-rose-950",
    label: "Moda",
  },
  shopping: {
    select:
      "border-sky-500/75 bg-sky-100 text-sky-950 font-semibold shadow-sm dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-50",
    option: "bg-sky-100 text-sky-950",
    label: "Shopping",
  },
  hotelaria: {
    select:
      "border-violet-500/75 bg-violet-100 text-violet-950 font-semibold shadow-sm dark:border-violet-500 dark:bg-violet-950/60 dark:text-violet-50",
    option: "bg-violet-100 text-violet-950",
    label: "Hotelaria",
  },
  hotel: {
    select:
      "border-teal-500/75 bg-teal-100 text-teal-950 font-semibold shadow-sm dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50",
    option: "bg-teal-100 text-teal-950",
    label: "Hotel",
  },
  clinicas: {
    select:
      "border-cyan-500/75 bg-cyan-100 text-cyan-950 font-semibold shadow-sm dark:border-cyan-500 dark:bg-cyan-950/60 dark:text-cyan-50",
    option: "bg-cyan-100 text-cyan-950",
    label: "Clínicas",
  },
  gastronomia: {
    select:
      "border-amber-500/75 bg-amber-100 text-amber-950 font-semibold shadow-sm dark:border-amber-500 dark:bg-amber-950/60 dark:text-amber-50",
    option: "bg-amber-100 text-amber-950",
    label: "Gastronomia",
  },
  outro: {
    select:
      "border-slate-500/60 bg-slate-200 text-slate-800 font-medium dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100",
    option: "bg-slate-200 text-slate-800",
    label: "Outro",
  },
};

const SELECT_BASE =
  "box-border h-7 max-w-[7.5rem] truncate rounded border px-1 text-[10px] capitalize";

export function categoriaSiteSelectClass(categoria: string): string {
  const key = categoria.trim().toLowerCase();
  const style = STYLES[key];
  return style ?
      `${SELECT_BASE} ${style.select}`
    : `${SELECT_BASE} border-slate-200 bg-white/80 text-slate-600 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300`;
}

export function categoriaSiteOptionClass(categoria: string): string {
  const key = categoria.trim().toLowerCase();
  return STYLES[key]?.option ?? "";
}

export function categoriaSiteLabel(categoria: string): string {
  if (!categoria.trim()) return "—";
  const key = categoria.trim().toLowerCase();
  return STYLES[key]?.label ?? categoria;
}
