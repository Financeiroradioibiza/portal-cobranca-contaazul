import { NextResponse } from "next/server";
import { buildFinanceiroOverview } from "@/lib/financeiro/financeiroOverviewService";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await buildFinanceiroOverview();
    if ("error" in data) {
      if (data.error === "not_connected") {
        return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
      }
      return NextResponse.json({ ok: false, error: data.error }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_error";
    console.error("[financeiro/visao-geral]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
