import { NextResponse } from "next/server";
import { PRODUCAO_CATALOGO_LAYOUT_YM } from "@/lib/cadastros/producaoCatalogo";
import { getProducaoCatalogLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ym: string }> };

export async function GET(_req: Request, _context: Ctx) {
  try {
    const layout = await getProducaoCatalogLayout({ repairPlacements: true });
    return NextResponse.json({ ok: true, layout, layoutYearMonth: PRODUCAO_CATALOGO_LAYOUT_YM });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, _context: Ctx) {
  let body: {
    clienteNomes?: unknown;
    pdvPlacements?: unknown;
    hiddenClienteKeys?: unknown;
    customClientes?: unknown;
    acknowledgedPdvs?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const layout = await saveProducaoLayout(PRODUCAO_CATALOGO_LAYOUT_YM, {
      ...(body.clienteNomes !== undefined ?
        { clienteNomes: body.clienteNomes as Record<string, string> }
      : {}),
      ...(body.pdvPlacements !== undefined ?
        { pdvPlacements: body.pdvPlacements as never }
      : {}),
      ...(body.hiddenClienteKeys !== undefined ?
        { hiddenClienteKeys: body.hiddenClienteKeys as string[] }
      : {}),
      ...(body.customClientes !== undefined ?
        { customClientes: body.customClientes as never }
      : {}),
      ...(body.acknowledgedPdvs !== undefined ?
        { acknowledgedPdvs: body.acknowledgedPdvs as string[] }
      : {}),
    });
    return NextResponse.json({ ok: true, layout, layoutYearMonth: PRODUCAO_CATALOGO_LAYOUT_YM });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
