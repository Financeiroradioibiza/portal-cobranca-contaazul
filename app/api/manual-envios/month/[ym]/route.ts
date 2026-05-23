import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { ensureMonthSnapshot } from "@/lib/manualReminders/monthService";

type Ctx = { params: Promise<{ ym: string }> };

export async function GET(_req: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }
  try {
    const month = await ensureMonthSnapshot(prisma, ym);
    return NextResponse.json({
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
