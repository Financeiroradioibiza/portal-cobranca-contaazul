import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteRioCompGrupoIfEmpty, renameRioCompGrupo, getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

type Ctx = { params: Promise<{ ym: string; grupoId: string }> };

export async function PATCH(req: Request, context: Ctx) {
  const { ym: raw, grupoId } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (!ym || !grupoId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let nome = "";
  try {
    const b = (await req.json()) as { nome?: unknown } | null;
    if (b && typeof b.nome === "string") nome = b.nome;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const month = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
      select: { id: true },
    });
    if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

    await renameRioCompGrupo(month.id, grupoId.trim(), nome);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({ ok: true, grupos: full?.grupos ?? [], linhas: full?.linhas ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    if (msg === "empty_name") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "grupo_not_found") return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  const { ym: raw, grupoId } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (!ym || !grupoId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const month = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
      select: { id: true },
    });
    if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

    await deleteRioCompGrupoIfEmpty(month.id, grupoId.trim());
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({ ok: true, grupos: full?.grupos ?? [], linhas: full?.linhas ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    if (msg === "grupo_not_empty") {
      return NextResponse.json({ error: "-move-clients-before-delete" }, { status: 409 });
    }
    if (msg === "grupo_not_found") return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
