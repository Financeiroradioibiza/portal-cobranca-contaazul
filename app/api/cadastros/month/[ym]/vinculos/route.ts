import { NextResponse } from "next/server";
import {
  listVinculosForMonth,
  parseCadastrosYearMonth,
} from "@/lib/player/listPortalPlayerRows";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ym: string }> };

export async function GET(_req: Request, context: Ctx) {
  const { ym: ymRaw } = await context.params;
  const ym = parseCadastrosYearMonth(ymRaw ?? "");
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    const payload = await listVinculosForMonth(ym);
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
