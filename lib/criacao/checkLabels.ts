export type CheckVerdict =
  | "mesma_gravacao"
  | "provavelmente_mesma"
  | "possivel_versao_ao_vivo_ou_diferente"
  | "revisar_possivel_versao"
  | "diferente"
  | "sem_par_na_pasta";

export function verdictLabel(verdict: CheckVerdict): string {
  switch (verdict) {
    case "mesma_gravacao":
      return "Mesma gravação";
    case "provavelmente_mesma":
      return "Provavelmente a mesma";
    case "possivel_versao_ao_vivo_ou_diferente":
      return "Possível versão ao vivo ou diferente";
    case "revisar_possivel_versao":
      return "Revisar — possível versão diferente";
    case "diferente":
      return "Faixa diferente";
    default:
      return "Sem par na pasta";
  }
}

/** Ordem de exibição: OK primeiro; depois 1 diferente, 2 versão ao vivo, 3 revisar, 4 sem par. */
export function checkVerdictSortOrder(verdict: CheckVerdict): number {
  switch (verdict) {
    case "mesma_gravacao":
      return 0;
    case "provavelmente_mesma":
      return 1;
    case "diferente":
      return 2;
    case "possivel_versao_ao_vivo_ou_diferente":
      return 3;
    case "revisar_possivel_versao":
      return 4;
    case "sem_par_na_pasta":
      return 5;
    default:
      return 9;
  }
}

export function checkDurationDeltaMs(
  uploadMs: number | null,
  sistemaMs: number | null | undefined,
): number {
  if (uploadMs == null || uploadMs <= 0 || sistemaMs == null || sistemaMs <= 0) return -1;
  return Math.abs(uploadMs - sistemaMs);
}

type CheckResultSortRow = {
  verdict: CheckVerdict;
  matchScore: number;
  durationMs: number | null;
  sistema?: { durationMs: number | null } | null;
};

/** Ordenação global + dentro de Revisar: menor % primeiro; mesmo % → maior Δ duração primeiro. */
export function compareCheckResultRows(a: CheckResultSortRow, b: CheckResultSortRow): number {
  const byVerdict = checkVerdictSortOrder(a.verdict) - checkVerdictSortOrder(b.verdict);
  if (byVerdict !== 0) return byVerdict;

  const byScore = a.matchScore - b.matchScore;
  if (byScore !== 0) return byScore;

  if (a.verdict === "revisar_possivel_versao" && b.verdict === "revisar_possivel_versao") {
    return (
      checkDurationDeltaMs(b.durationMs, b.sistema?.durationMs) -
      checkDurationDeltaMs(a.durationMs, a.sistema?.durationMs)
    );
  }

  return 0;
}

export function verdictClass(verdict: CheckVerdict): string {
  switch (verdict) {
    case "mesma_gravacao":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    case "provavelmente_mesma":
      return "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200";
    case "possivel_versao_ao_vivo_ou_diferente":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200";
    case "revisar_possivel_versao":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "diferente":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}
