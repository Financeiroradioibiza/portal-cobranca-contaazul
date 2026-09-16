import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  createPlanilhaProdRow,
  type PlanilhaProdRowCreate,
} from "@/lib/criacao/planilhaProdService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as PlanilhaProdRowCreate;
    const result = await createPlanilhaProdRow(body);
    if (result.error === "migration_pendente") {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
    if (result.error === "mes_nao_encontrado") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (
      result.error === "mes_obrigatorio" ||
      result.error === "criativo_obrigatorio" ||
      result.error === "cliente_obrigatorio"
    ) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ row: result.row }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/planilha-prod/row POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
