import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { parsePlanilhaProdWorkbook } from "@/lib/criacao/planilhaProdImport";
import { importPlanilhaProdMonths } from "@/lib/criacao/planilhaProdService";
import { hasPlanilhaProdTable } from "@/lib/criacao/planilhaProdSchemaCompat";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!(await hasPlanilhaProdTable())) {
      return NextResponse.json({ error: "migration_pendente" }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "arquivo_obrigatorio" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const months = await parsePlanilhaProdWorkbook(buffer);
    if (months.length === 0) {
      return NextResponse.json({ error: "nenhuma_aba_valida" }, { status: 400 });
    }

    const stats = await importPlanilhaProdMonths(months);
    return NextResponse.json(stats);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/planilha-prod/import POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
