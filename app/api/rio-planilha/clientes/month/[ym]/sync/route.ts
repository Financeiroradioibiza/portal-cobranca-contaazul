import { NextResponse } from "next/server";
import { syncRioCompMonthFromContaAzul } from "@/lib/rio/rioClienteCompService";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ ym: string }> };

export async function POST(req: Request, context: Ctx) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "conta_azul_disconnected" }, { status: 401 });
  }

  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let includeContracts = process.env.RIO_SYNC_CONTRACTS_DEFAULT === "1";
  try {
    const b = (await req.json()) as { includeContracts?: unknown } | null;
    if (b && typeof b === "object" && b !== null && "includeContracts" in b) {
      includeContracts = Boolean(b.includeContracts);
    }
  } catch {
    /* corpo vazio ou não-JSON */
  }

  try {
    const { month, linhas, caPersonListingCount, syncedContractsFromCa } =
      await syncRioCompMonthFromContaAzul(token, ym, { includeContracts });
    return NextResponse.json({
      ok: true,
      month,
      linhas,
      count: linhas.length,
      caPersonListingCount,
      syncedContractsFromCa,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
