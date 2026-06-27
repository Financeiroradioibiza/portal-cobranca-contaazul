import { competenciaFromDate } from "@/lib/criacao/competencia";

/** Tag padrão de lote no formato MM/YY (ex.: 06/26 = junho de 2026, fuso BR). */
export function defaultUploadCompetenciaTag(date = new Date()): string {
  const comp = competenciaFromDate(date);
  const [yyyy, mm] = comp.split("-");
  return `${mm}/${yyyy.slice(-2)}`;
}

/** Tags de competência de upload (06/26, 07/26…). */
export function isUploadCompetenciaTag(nome: string): boolean {
  return /^\d{2}\/\d{2}$/.test((nome || "").trim());
}
