import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRioCompClienteLinha, getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

type Ctx = { params: Promise<{ ym: string }> };

/** POST — nova linha de cliente manual nesta competência. */
export async function POST(req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* corpo vazio */
  }

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true, closedAt: true },
  });
  if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });
  if (month.closedAt) return NextResponse.json({ error: "month_closed" }, { status: 403 });

  const nomeFantasia = typeof body.nomeFantasia === "string" ? body.nomeFantasia : undefined;
  const documento =
    typeof body.documento === "string" ? body.documento
    : body.documento === null ? null
    : undefined;
  const rioGrupoId =
    typeof body.rioGrupoId === "string" ? body.rioGrupoId
    : body.rioGrupoId === null ? null
    : undefined;

  try {
    const linha = await createRioCompClienteLinha(month.id, {
      nomeFantasia,
      documento,
      rioGrupoId,
    });
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({
      ok: true,
      linha,
      grupos: full?.grupos ?? [],
      linhas: full?.linhas ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
