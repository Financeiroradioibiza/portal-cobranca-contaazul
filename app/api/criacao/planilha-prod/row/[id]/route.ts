import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { patchPlanilhaProdRow, type PlanilhaProdRowPatch } from "@/lib/criacao/planilhaProdService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as PlanilhaProdRowPatch;
    const result = await patchPlanilhaProdRow(id, body);
    if (result.error === "nao_encontrado") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error === "migration_pendente") {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
    return NextResponse.json({ row: result.row });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/planilha-prod/row PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
