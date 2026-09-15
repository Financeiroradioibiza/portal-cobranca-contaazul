import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listPlanilhaProdMonths } from "@/lib/criacao/planilhaProdService";
import { hasPlanilhaProdTable } from "@/lib/criacao/planilhaProdSchemaCompat";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const migrationPendente = !(await hasPlanilhaProdTable());
    const months = await listPlanilhaProdMonths();
    return NextResponse.json({ months, migrationPendente });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/planilha-prod/months GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
