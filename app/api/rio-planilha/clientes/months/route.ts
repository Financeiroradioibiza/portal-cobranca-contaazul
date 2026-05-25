import { NextResponse } from "next/server";
import { ensureRioCompMonth, listRioCompMonths } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

export async function GET() {
  try {
    const months = await listRioCompMonths();
    return NextResponse.json({ months });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const ym =
    typeof body.yearMonth === "number" && Number.isFinite(body.yearMonth) ?
      Math.floor(body.yearMonth)
    : typeof body.yearMonth === "string" ?
      parseYearMonthParam(body.yearMonth)
    : null;
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    const month = await ensureRioCompMonth(ym);
    return NextResponse.json({ month: { id: month.id, yearMonth: month.yearMonth } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
