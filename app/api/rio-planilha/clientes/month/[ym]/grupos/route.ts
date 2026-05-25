import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRioCompGrupo, reorderRioCompGrupos, getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

type Ctx = { params: Promise<{ ym: string }> };

export async function POST(req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let nome = "";
  try {
    const b = (await req.json()) as { nome?: unknown } | null;
    if (b && typeof b.nome === "string") nome = b.nome;
  } catch {
    /* opcional */
  }

  try {
    const month = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
      select: { id: true },
    });
    if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

    const g = await createRioCompGrupo(month.id, nome || undefined);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({ ok: true, grupo: g, grupos: full?.grupos ?? [], linhas: full?.linhas ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Reordenar apenas os blocos MARCA (`orderedIds`). */
export async function PATCH(req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let orderedIds: string[] = [];
  try {
    const b = (await req.json()) as { orderedIds?: unknown } | null;
    const arr = b?.orderedIds;
    orderedIds =
      Array.isArray(arr) && arr.every((x) => typeof x === "string") ? (arr as string[]) : [];
  } catch {
    orderedIds = [];
  }

  try {
    const month = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
      select: { id: true },
    });
    if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

    await reorderRioCompGrupos(month.id, orderedIds);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({ ok: true, grupos: full?.grupos ?? [], linhas: full?.linhas ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
