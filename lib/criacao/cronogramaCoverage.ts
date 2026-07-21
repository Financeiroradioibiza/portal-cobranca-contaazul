import { prisma } from "@/lib/prisma";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diasFromCsv(csv: string): number[] {
  const raw = (csv || "").trim();
  if (!raw) return [0, 1, 2, 3, 4, 5, 6];
  return raw
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export type CronogramaCoverageResult = {
  ok: boolean;
  hasTocaSemprePasta: boolean;
  missingDays: number[];
  missingDayLabels: string[];
};

/** Garante que cada dia da semana tenha música (pasta «tocar sempre» ou cronograma de pasta). */
export async function validateProgramacaoMusicaCoverage(
  programacaoId: string,
): Promise<CronogramaCoverageResult> {
  const [pastas, agendamentos] = await Promise.all([
    prisma.pasta.findMany({
      where: { programacaoId },
      select: { id: true, selecionavel: true },
    }),
    prisma.agendamento.findMany({
      where: { programacaoId, ativo: true, alvoTipo: "pasta" },
      select: { alvoId: true, diasSemana: true },
    }),
  ]);

  const agCountByPasta = new Map<string, number>();
  for (const ag of agendamentos) {
    agCountByPasta.set(ag.alvoId, (agCountByPasta.get(ag.alvoId) ?? 0) + 1);
  }

  const hasTocaSemprePasta = pastas.some(
    (p) => !p.selecionavel && (agCountByPasta.get(p.id) ?? 0) === 0,
  );
  if (hasTocaSemprePasta) {
    return {
      ok: true,
      hasTocaSemprePasta: true,
      missingDays: [],
      missingDayLabels: [],
    };
  }

  const covered = new Set<number>();
  for (const ag of agendamentos) {
    for (const d of diasFromCsv(ag.diasSemana)) covered.add(d);
  }

  const missingDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !covered.has(d));
  return {
    ok: missingDays.length === 0,
    hasTocaSemprePasta: false,
    missingDays,
    missingDayLabels: missingDays.map((d) => DOW[d] ?? String(d)),
  };
}

export function cronogramaLacunasErrorMessage(cov: CronogramaCoverageResult): string {
  const dias = cov.missingDayLabels.join(", ");
  return `cronograma_lacunas_semana:${dias}`;
}
