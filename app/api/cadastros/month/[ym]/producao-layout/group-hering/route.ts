import { NextResponse } from "next/server";
import { parseCadastrosYearMonth } from "@/lib/cadastros/painelPdvLinkService";
import { groupHeringSinglePointPdvs } from "@/lib/cadastros/producaoHeringGroupService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ym: string }> };

export async function POST(_req: Request, context: Ctx) {
  const { ym: ymRaw } = await context.params;
  const ym = parseCadastrosYearMonth(ymRaw ?? "");
  if (ym == null) return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });

  try {
    const result = await groupHeringSinglePointPdvs(ym);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    const status = msg === "month_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
