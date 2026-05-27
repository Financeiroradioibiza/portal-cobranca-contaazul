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
    sortOrder: number;
    rioGrupoId: string | null;
    valorClienteTexto: string;
    valorPdvUnitarioTexto: string;
  }> = {};

  if (typeof body.grupoSite === "string") patch.grupoSite = body.grupoSite.slice(0, 8000);
  if (typeof body.categoriaSite === "string") patch.categoriaSite = body.categoriaSite.slice(0, 120);
  if (typeof body.observacoesLinha === "string")
    patch.observacoesLinha = body.observacoesLinha.slice(0, 20000);

  if (typeof body.numeroPdvSite === "number" && Number.isFinite(body.numeroPdvSite)) {
    patch.numeroPdvSite = Math.max(0, Math.floor(body.numeroPdvSite));
  }

  if (typeof body.valorClienteTexto === "string") {
    patch.valorClienteTexto = body.valorClienteTexto.slice(0, 200);
  }
  if (typeof body.valorPdvUnitarioTexto === "string") {
    patch.valorPdvUnitarioTexto = body.valorPdvUnitarioTexto.slice(0, 200);
  }

  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    patch.sortOrder = Math.max(0, Math.floor(body.sortOrder));
  }

  if (body.rioGrupoId === null) {
    patch.rioGrupoId = null;
  } else if (typeof body.rioGrupoId === "string") {
    const gid = body.rioGrupoId.trim();
    patch.rioGrupoId = gid.length ? gid : null;
  }

  if (typeof patch.rioGrupoId === "string") {
    const g = await prisma.rioCompGrupo.findFirst({
      where: { id: patch.rioGrupoId, monthId: month.id },
    });
    if (!g) return NextResponse.json({ error: "grupo_not_found" }, { status: 400 });
    patch.grupoSite = g.nome;
  } else if (patch.rioGrupoId === null) {
    patch.grupoSite = "";
  }

  await patchRioCompClienteLinha(linha.id, patch);
  const raw = await prisma.rioCompClienteLinha.findUniqueOrThrow({
    where: { id: linha.id },
    include: {
      pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] },
      rioGrupo: { select: { id: true, nome: true, sortOrder: true } },
    },
  });
  const { rioGrupo: rg, ...core } = raw;
  const linhaOut = {
    ...core,
    grupo:
      rg ?
        {
          id: rg.id,
          nome: rg.nome,
          sortOrder: rg.sortOrder,
        }
      : null,
  };
  return NextResponse.json({ ok: true, linha: linhaOut });
}
