import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ensureRioCompMonth,
  getRioCompMonthWithLinhas,
} from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

type Ctx = { params: Promise<{ ym: string }> };

export async function GET(_req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    const monthMeta = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
    });
    if (!monthMeta) {
      return NextResponse.json({
        month: null,
        yearMonth: ym,
        grupos: [],
        linhas: [],
      });
    }

    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({
      month: full?.month ?? monthMeta,
      grupos: full?.grupos ?? [],
      linhas: full?.linhas ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT vazio garante apenas o shell do mês (sem sincronização CA). */
export async function PUT(_req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    await ensureRioCompMonth(ym);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({
      month: full?.month ?? null,
      grupos: full?.grupos ?? [],
      linhas: full?.linhas ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
