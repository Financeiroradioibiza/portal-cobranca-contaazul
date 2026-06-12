import { NextResponse } from "next/server";
import { getProducaoSuporte } from "@/lib/cadastros/producaoSuporteService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym") ?? "";
  const ym = parseYearMonthParam(ymRaw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    const payload = await getProducaoSuporte(ym);
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
