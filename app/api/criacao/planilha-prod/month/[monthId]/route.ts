import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getPlanilhaProdMonth } from "@/lib/criacao/planilhaProdService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ monthId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { monthId } = await ctx.params;
    const payload = await getPlanilhaProdMonth(monthId);
    if (!payload) {
      return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/planilha-prod/month GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
