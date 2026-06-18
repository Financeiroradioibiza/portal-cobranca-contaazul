import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { updateFaixaEdicao } from "@/lib/criacao/edicaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      mixSegundosFinais?: number | null;
      trimInicioMs?: number | null;
      trimFimMs?: number | null;
    };
    const ok = await updateFaixaEdicao(id, body);
    return NextResponse.json({ ok });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/musicas/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
