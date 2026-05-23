import type { ManualReminderRow, ManualReminderRowStatus, PrismaClient } from "@prisma/client";
import { ensureTemplatesFromSeed } from "./seedTemplates";

const LINHA_ORDER = [
  { emissionDay: "asc" as const },
  { sortOrder: "asc" as const },
  { clienteNome: "asc" as const },
];

export async function ensureMonthSnapshot(
  prisma: PrismaClient,
  yearMonth: number,
): Promise<{ id: string; yearMonth: number; linhas: ManualReminderRow[] }> {
  await ensureTemplatesFromSeed(prisma);

  let month = await prisma.manualReminderMonth.findUnique({
    where: { yearMonth },
    include: { linhas: { orderBy: LINHA_ORDER } },
  });

  if (month) {
    return month;
  }

  const templates = await prisma.manualReminderTemplate.findMany({
    orderBy: [{ emissionDay: "asc" }, { sortOrder: "asc" }, { clienteNome: "asc" }],
  });

  const created = await prisma.manualReminderMonth.create({
    data: {
      yearMonth,
      linhas: {
        createMany: {
          data: templates.map((t, i) => ({
            emissionDay: t.emissionDay,
            clienteNome: t.clienteNome,
            cnpjDocumento: t.cnpjDocumento,
            solicitarPedirOc: t.solicitarPedirOc,
            spreadsheetHint: t.spreadsheetHint,
            sortOrder: i,
            status: "pendente" satisfies ManualReminderRowStatus,
          })),
        },
      },
    },
    include: { linhas: { orderBy: LINHA_ORDER } },
  });

  return created;
}

export async function listMonths(prisma: PrismaClient): Promise<{ id: string; yearMonth: number }[]> {
  const rows = await prisma.manualReminderMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { id: true, yearMonth: true },
  });
  return rows;
}
