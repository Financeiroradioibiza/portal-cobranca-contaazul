import { NextResponse } from "next/server";
import { applyMarcaPdvCsvLayoutToMonth } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

type Ctx = { params: Promise<{ ym: string }> };

/** Import «planilha interna»: col. A MARCA, B nº PDV, C nomes; H categoria; ignora valor/CNPJ. */
export async function POST(req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const name = file.name || "upload";
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const { month, grupos, linhas, warnings, appliedCount, unmatchedLabels } =
      await applyMarcaPdvCsvLayoutToMonth(ym, buf, name);
    return NextResponse.json({
      ok: true,
      month,
      grupos,
      linhas,
      appliedCount,
      unmatchedCount: unmatchedLabels.length,
      unmatchedLabels,
      warnings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "import_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
