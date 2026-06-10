import { NextResponse } from "next/server";
import {
  parseCadastrosYearMonth,
  suggestBulkForRioPdvs,
} from "@/lib/cadastros/painelPdvLinkService";
import { BULK_BATCH_SIZE } from "@/lib/cadastros/painelMatch";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ym: string }> };

export async function POST(request: Request, context: Ctx) {
  const { ym: ymRaw } = await context.params;
  const ym = parseCadastrosYearMonth(ymRaw ?? "");
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawIds = body.rioPdvIds;
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: "rio_pdv_ids_obrigatorio" }, { status: 400 });
  }

  const rioPdvIds = rawIds
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);

  if (rioPdvIds.length === 0) {
    return NextResponse.json({ ok: true, yearMonth: ym, items: [] });
  }
  if (rioPdvIds.length > BULK_BATCH_SIZE) {
    return NextResponse.json({ error: "batch_limit_10" }, { status: 400 });
  }

  let minScore: number | undefined;
  if (typeof body.minScore === "number" && Number.isFinite(body.minScore)) {
    minScore = Math.max(0, Math.floor(body.minScore));
  }

  try {
    const items = await suggestBulkForRioPdvs(rioPdvIds, { minScore });
    return NextResponse.json({ ok: true, yearMonth: ym, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    const status = msg === "batch_limit_10" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
