import type { ManualReminderRowStatus, PrismaClient } from "@prisma/client";
import { manualReminderLinhaApiSelect } from "@/lib/manualReminders/manualLinhaApiSelect";
import { ensureTemplatesFromSeed } from "./seedTemplates";
import { stripManualReminderRowsBlob } from "./manualRowPayload";

const LINHA_ORDER = [
  { emissionDay: "asc" as const },
  { sortOrder: "asc" as const },
  { clienteNome: "asc" as const },
];

export type MonthWithLinhasPayload = {
  id: string;
  yearMonth: number;
  linhas: ReturnType<typeof stripManualReminderRowsBlob>;
};

export async function ensureMonthSnapshot(
  prisma: PrismaClient,
  yearMonth: number,
): Promise<MonthWithLinhasPayload> {
  await ensureTemplatesFromSeed(prisma);

  let month = await prisma.manualReminderMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: {
        orderBy: LINHA_ORDER,
        select: manualReminderLinhaApiSelect,
      },
    },
  });

  if (month) {
    return {
      id: month.id,
      yearMonth: month.yearMonth,
      linhas: stripManualReminderRowsBlob(month.linhas),
    };
  }

  /**
   * Donor = competência **anterior** mais recente que já tenha linhas.
   * Só olhar `ym - 1` falha se esse mês não existir ou estiver vazio (buraco na
   * sequência) — aí caíamos nos templates e perdíamos `contaAzulPersonId` / e-mail.
   */
  const precedingMonths = await prisma.manualReminderMonth.findMany({
    where: { yearMonth: { lt: yearMonth } },
    orderBy: { yearMonth: "desc" },
    include: {
      linhas: {
        orderBy: LINHA_ORDER,
        select: manualReminderLinhaApiSelect,
      },
    },
  });
  const donorMonth = precedingMonths.find((m) => m.linhas.length > 0) ?? null;

  let created;
  if (donorMonth) {
    created = await prisma.manualReminderMonth.create({
      data: {
        yearMonth,
        linhas: {
          createMany: {
            data: donorMonth.linhas.map((r, i) => ({
              emissionDay: r.emissionDay,
              clienteNome: r.clienteNome,
              cnpjDocumento: r.cnpjDocumento,
              contaAzulPersonId: r.contaAzulPersonId,
              solicitarPedirOc: r.solicitarPedirOc,
              anexarListagemClientesOc: r.anexarListagemClientesOc,
              spreadsheetHint: r.spreadsheetHint,
              emailCobranca: r.emailCobranca,
              notes: r.notes,
              sortOrder: i,
              status: "pendente" satisfies ManualReminderRowStatus,
              // anexo só no mês em curso — não replica bytes/nome/mime.
            })),
          },
        },
      },
      include: {
        linhas: {
          orderBy: LINHA_ORDER,
          select: manualReminderLinhaApiSelect,
        },
      },
    });
  } else {
    const templates = await prisma.manualReminderTemplate.findMany({
      orderBy: [{ emissionDay: "asc" }, { sortOrder: "asc" }, { clienteNome: "asc" }],
    });

    created = await prisma.manualReminderMonth.create({
      data: {
        yearMonth,
        linhas: {
          createMany: {
            data: templates.map((t, i) => ({
              emissionDay: t.emissionDay,
              clienteNome: t.clienteNome,
              cnpjDocumento: t.cnpjDocumento,
              solicitarPedirOc: t.solicitarPedirOc,
              anexarListagemClientesOc: t.anexarListagemClientesOc,
              spreadsheetHint: t.spreadsheetHint,
              sortOrder: i,
              status: "pendente" satisfies ManualReminderRowStatus,
            })),
          },
        },
      },
      include: {
        linhas: {
          orderBy: LINHA_ORDER,
          select: manualReminderLinhaApiSelect,
        },
      },
    });
  }

  return {
    id: created.id,
    yearMonth: created.yearMonth,
    linhas: stripManualReminderRowsBlob(created.linhas),
  };
}

export async function listMonths(prisma: PrismaClient): Promise<{ id: string; yearMonth: number }[]> {
  const rows = await prisma.manualReminderMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { id: true, yearMonth: true },
  });
  return rows;
}
