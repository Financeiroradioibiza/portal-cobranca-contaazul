import { NextResponse } from "next/server";
import { parseCadastrosYearMonth } from "@/lib/cadastros/painelPdvLinkService";
import { getProducaoLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ym: string }> };

export async function GET(_req: Request, context: Ctx) {
  const { ym: ymRaw } = await context.params;
  const ym = parseCadastrosYearMonth(ymRaw ?? "");
  if (ym == null) return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  try {
    const layout = await getProducaoLayout(ym);
    return NextResponse.json({ ok: true, layout });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, context: Ctx) {
  const { ym: ymRaw } = await context.params;
  const ym = parseCadastrosYearMonth(ymRaw ?? "");
  if (ym == null) return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });

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
    const layout = await saveProducaoLayout(ym, {
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
    return NextResponse.json({ ok: true, layout });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
