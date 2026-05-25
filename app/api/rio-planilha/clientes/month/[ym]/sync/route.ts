import { NextResponse } from "next/server";
import { syncRioCompMonthFromContaAzul } from "@/lib/rio/rioClienteCompService";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ ym: string }> };

export async function POST(_req: Request, context: Ctx) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "conta_azul_disconnected" }, { status: 401 });
  }

  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    const { month, linhas, caPersonListingCount } = await syncRioCompMonthFromContaAzul(
      token,
      ym,
    );
    return NextResponse.json({
      ok: true,
      month,
      linhas,
      count: linhas.length,
      caPersonListingCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
