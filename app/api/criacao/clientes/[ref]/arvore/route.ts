import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getClienteProgramacaoArvore } from "@/lib/criacao/programacaoService";

type Ctx = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { ref } = await ctx.params;
    const arvore = await getClienteProgramacaoArvore(decodeURIComponent(ref));
    return NextResponse.json({ arvore });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/clientes/:ref/arvore GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
