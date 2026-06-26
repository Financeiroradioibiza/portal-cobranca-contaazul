const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function brazilNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

export function competenciaFromDate(d = new Date()): string {
  const br = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${br.getFullYear()}-${String(br.getMonth() + 1).padStart(2, "0")}`;
}

export function mesNomeFromCompetencia(competencia: string): string {
  const [, mm] = competencia.split("-");
  const idx = Number(mm) - 1;
  return MESES_PT[idx] ?? competencia;
}

export function competenciaLabel(competencia: string): string {
  const [yyyy, mm] = competencia.split("-");
  const idx = Number(mm) - 1;
  const mes = MESES_PT[idx] ?? mm;
  return `${mes} ${yyyy}`;
}

export function mesNomeCurtoFromDate(d = new Date()): string {
  const br = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return MESES_PT[br.getMonth()] ?? "Mês";
}

/** Últimos N meses incluindo o atual (YYYY-MM), mais recente primeiro. */
export function listCompetenciasRecentes(count = 12, from = new Date()): string[] {
  const br = new Date(from.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(br.getFullYear(), br.getMonth() - i, 1);
    out.push(competenciaFromDate(d));
  }
  return out;
}

export function parseCompetencia(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const m = Number(s.slice(5, 7));
  if (m < 1 || m > 12) return null;
  return s;
}
