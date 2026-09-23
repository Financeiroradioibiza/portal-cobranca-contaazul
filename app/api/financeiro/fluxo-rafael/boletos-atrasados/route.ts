import { NextResponse } from "next/server";
import { requireFluxoRafaelSession } from "@/lib/auth/portalAccess";
import { buildFluxoRafaelBoletosAtrasados } from "@/lib/financeiro/financeiroOverviewService";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  await requireFluxoRafaelSession();
  const payload = await buildFluxoRafaelBoletosAtrasados();
  if ("error" in payload) {
    const status = payload.error === "not_connected" ? 503 : 500;
    return NextResponse.json(payload, { status });
  }
  return NextResponse.json(payload);
}
