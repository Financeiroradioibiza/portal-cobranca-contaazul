import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentBrazilYearMonth, parseYearMonthParam, shiftYearMonth } from "@/lib/manualReminders/yearMonth";
import { ensureInitialRioMonthIfEmpty, ensureRioMonth, listRioMonths } from "@/lib/rio/rioPlanilhaService";
export async function GET() {
  try {
    await ensureInitialRioMonthIfEmpty();
    const months = await listRioMonths(prisma);
    return NextResponse.json({ months });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST: garante um mês específico (`yearMonth` no corpo OU mês seguinte ao mais recente se `advance: true`).
 */
export async function POST(request: Request) {
  try {
    let body: { yearMonth?: unknown; advance?: unknown };
    try {
      body = (await request.json()) as { yearMonth?: unknown; advance?: unknown };
    } catch {
      body = {};
    }

    let ym: number | null =
      typeof body.yearMonth === "number"
        ? body.yearMonth
        : typeof body.yearMonth === "string"
          ? parseYearMonthParam(body.yearMonth)
          : null;

    if (!ym && body.advance === true) {
      await ensureInitialRioMonthIfEmpty();
      const months = await listRioMonths(prisma);
      const latest = months[0]?.yearMonth ?? currentBrazilYearMonth();
      ym = shiftYearMonth(latest, 1);
    }

    if (ym == null) {
      ym = currentBrazilYearMonth();
    }

    const month = await ensureRioMonth(prisma, ym);
    const months = await listRioMonths(prisma);
    return NextResponse.json({
      activeYearMonth: ym,
      months,
      month: { id: month.id, yearMonth: month.yearMonth },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
