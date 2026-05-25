import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderRioPdvsForClienteLinha, getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

type Ctx = { params: Promise<{ ym: string; linhaId: string }> };

export async function PATCH(req: Request, context: Ctx) {
  const { ym: rawYm, linhaId } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (!ym || !linhaId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let orderedPdvIds: string[] = [];
  try {
    const b = (await req.json()) as { orderedPdvIds?: unknown } | null;
    orderedPdvIds =
      Array.isArray(b?.orderedPdvIds) && b!.orderedPdvIds.every((x) => typeof x === "string")
        ? (b!.orderedPdvIds as string[])
        : [];
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const month = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
      select: { id: true },
    });
    if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

    const linha = await prisma.rioCompClienteLinha.findFirst({
      where: { id: linhaId.trim(), monthId: month.id },
      select: { id: true },
    });
    if (!linha) return NextResponse.json({ error: "line_not_found" }, { status: 404 });

    await reorderRioPdvsForClienteLinha(linha.id, orderedPdvIds);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({ ok: true, grupos: full?.grupos ?? [], linhas: full?.linhas ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
