import { NextResponse } from "next/server";
import { patchRioCompClienteLinha } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ ym: string; linhaId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const { ym: rawYm, linhaId } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (!ym || !linhaId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

  const linha = await prisma.rioCompClienteLinha.findFirst({
    where: { id: linhaId, monthId: month.id },
  });
  if (!linha) return NextResponse.json({ error: "line_not_found" }, { status: 404 });

  const patch: Partial<{
    grupoSite: string;
    numeroPdvSite: number;
    categoriaSite: string;
    observacoesLinha: string;
  }> = {};

  if (typeof body.grupoSite === "string") patch.grupoSite = body.grupoSite.slice(0, 8000);
  if (typeof body.categoriaSite === "string") patch.categoriaSite = body.categoriaSite.slice(0, 120);
  if (typeof body.observacoesLinha === "string")
    patch.observacoesLinha = body.observacoesLinha.slice(0, 20000);

  if (typeof body.numeroPdvSite === "number" && Number.isFinite(body.numeroPdvSite)) {
    patch.numeroPdvSite = Math.max(0, Math.floor(body.numeroPdvSite));
  }

  await patchRioCompClienteLinha(linha.id, patch);
  const ref = await prisma.rioCompClienteLinha.findUniqueOrThrow({
    where: { id: linha.id },
    include: { pdvs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });

  return NextResponse.json({ ok: true, linha: ref });
}
