import type { RioCompGrupo } from "@prisma/client";
import { shiftYearMonth } from "@/lib/manualReminders/yearMonth";

/** Primeira competência com virada de mês (cópia do anterior + entradas/saídas PDV). Maio/2025 e anteriores: fluxo antigo. */
export const RIO_TURNOVER_FIRST_YEAR_MONTH = Number(
  process.env.RIO_TURNOVER_FROM_YM ?? "202606",
);

export function isRioTurnoverMonth(yearMonth: number): boolean {
  return yearMonth >= RIO_TURNOVER_FIRST_YEAR_MONTH;
}

export type RioSystemGrupoTag = "ca_entrada" | "ca_saida" | "pdv_entrada" | "pdv_saida";

export const RIO_SYSTEM_GRUPOS: ReadonlyArray<{
  tag: RioSystemGrupoTag;
  nome: string;
  sortOrder: number;
}> = [
  { tag: "ca_entrada", nome: "Clientes Conta Azul entrando", sortOrder: -400 },
  { tag: "ca_saida", nome: "Clientes Conta Azul saindo", sortOrder: -300 },
  { tag: "pdv_entrada", nome: "PDVs entrando no mês", sortOrder: -200 },
  { tag: "pdv_saida", nome: "PDVs saindo no mês", sortOrder: -100 },
];

export function isRioSystemGrupoTag(v: string | null | undefined): v is RioSystemGrupoTag {
  return v === "ca_entrada" || v === "ca_saida" || v === "pdv_entrada" || v === "pdv_saida";
}

export function isUserMarcaGrupo(g: Pick<RioCompGrupo, "systemTag">): boolean {
  return !g.systemTag;
}

export function donorYearMonthFor(targetYm: number): number {
  return shiftYearMonth(targetYm, -1);
}
