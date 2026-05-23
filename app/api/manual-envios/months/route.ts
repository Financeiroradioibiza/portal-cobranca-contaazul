import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentBrazilYearMonth, parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { ensureMonthSnapshot, listMonths } from "@/lib/manualReminders/monthService";

export async function GET() {
  try {
    const months = await listMonths(prisma);
    return NextResponse.json({ months });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Garante mês existe (snapshot a partir dos templates seed).
 */
export async function POST(request: Request) {
  try {
    let body: { yearMonth?: unknown };
    try {
      body = (await request.json()) as { yearMonth?: unknown };
    } catch {
      body = {};
    }

    let ym =
      typeof body.yearMonth === "number"
        ? body.yearMonth
        : typeof body.yearMonth === "string"
          ? parseYearMonthParam(body.yearMonth)
          : null;
    if (ym == null) {
      ym = currentBrazilYearMonth();
    }

    const month = await ensureMonthSnapshot(prisma, ym);

    const months = await listMonths(prisma);
    return NextResponse.json({
      activeYearMonth: ym,
      months,
      month: {
        id: month.id,
        yearMonth: month.yearMonth,
        linhas: month.linhas,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
