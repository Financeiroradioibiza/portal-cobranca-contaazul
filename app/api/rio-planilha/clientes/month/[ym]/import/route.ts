import { NextResponse } from "next/server";
import { parseRioClienteImportTable } from "@/lib/rio/rioCompFileImport";
import { replaceRioCompMonthFromImportedRows } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

type Ctx = { params: Promise<{ ym: string }> };

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

  let rows;
  let warnings;
  try {
    const parsed = parseRioClienteImportTable(name, buf);
    rows = parsed.rows;
    warnings = parsed.warnings;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json(
      { error: "no_rows", warnings },
      { status: 400 },
    );
  }

  const inferRaw = form.get("inferMovement");
  const inferMovementVsPriorMonth =
    inferRaw !== "0" && inferRaw !== "false" && inferRaw !== "off";

  try {
    const { month, grupos, linhas } = await replaceRioCompMonthFromImportedRows(ym, rows, {
      inferMovementVsPriorMonth,
    });
    return NextResponse.json({
      ok: true,
      month,
      grupos,
      linhas,
      count: linhas.length,
      warnings,
      inferMovementVsPriorMonth,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "import_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
