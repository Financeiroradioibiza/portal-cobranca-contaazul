import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assignClienteLinhasLayout, getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

type Ctx = { params: Promise<{ ym: string }> };

/** Atribui `rio_grupo_id` + `sort_order` a várias linhas (drag-and-drop MARCA/cliente). */
export async function PATCH(req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (!ym) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let items: { id: string; rio_grupo_id: string | null; sort_order: number }[] = [];
  try {
    const b = (await req.json()) as { items?: unknown } | null;
    const rawItems = b?.items;
    if (!Array.isArray(rawItems)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    for (const it of rawItems) {
      if (typeof it !== "object" || it === null) continue;
      const o = it as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const sort_order = typeof o.sort_order === "number" && Number.isFinite(o.sort_order) ? o.sort_order : null;
      if (!id.trim() || sort_order === null) continue;
      let rio_grupo_id: string | null = null;
      if (Object.prototype.hasOwnProperty.call(o, "rio_grupo_id")) {
        const v = o.rio_grupo_id;
        if (v === null) rio_grupo_id = null;
        else if (typeof v === "string") rio_grupo_id = v.trim() || null;
        else continue;
      }
      items.push({ id: id.trim(), rio_grupo_id, sort_order });
    }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const month = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: ym },
      select: { id: true },
    });
    if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

    await assignClienteLinhasLayout(month.id, items);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({ ok: true, grupos: full?.grupos ?? [], linhas: full?.linhas ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
