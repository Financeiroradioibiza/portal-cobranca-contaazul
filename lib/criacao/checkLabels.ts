export type CheckVerdict =
  | "mesma_gravacao"
  | "provavelmente_mesma"
  | "revisar_possivel_versao"
  | "diferente"
  | "sem_par_na_pasta";

export function verdictLabel(verdict: CheckVerdict): string {
  switch (verdict) {
    case "mesma_gravacao":
      return "Mesma gravação";
    case "provavelmente_mesma":
      return "Provavelmente a mesma";
    case "revisar_possivel_versao":
      return "Revisar — possível versão diferente";
    case "diferente":
      return "Faixa diferente";
    default:
      return "Sem par na pasta";
  }
}

export function verdictClass(verdict: CheckVerdict): string {
  switch (verdict) {
    case "mesma_gravacao":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    case "provavelmente_mesma":
      return "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200";
    case "revisar_possivel_versao":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "diferente":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}
