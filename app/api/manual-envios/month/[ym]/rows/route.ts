import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { ensureMonthSnapshot } from "@/lib/manualReminders/monthService";

/**
 * Nova linha vazia (cliente novo) dentro do mês.
 */
export async function POST(req: Request, context: { params: Promise<{ ym: string }> }) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  const snap = await ensureMonthSnapshot(prisma, ym);
  const month = { id: snap.id };

  const maxOrd = await prisma.manualReminderRow.aggregate({
    where: { monthId: month.id },
    _max: { sortOrder: true },
  });
  const nextOrder = (maxOrd._max.sortOrder ?? -1) + 1;

  const row = await prisma.manualReminderRow.create({
    data: {
      monthId: month.id,
      emissionDay: 1,
      clienteNome: "Novo cliente",
      solicitarPedirOc: true,
      sortOrder: nextOrder,
    },
  });

  return NextResponse.json({ row }, { status: 201 });
}
