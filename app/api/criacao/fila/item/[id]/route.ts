import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { resolveDuplicata } from "@/lib/criacao/filaService";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    let body: { decision?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    if (body.decision !== "nova" && body.decision !== "existente") {
      return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
    }
    const ok = await resolveDuplicata(id, body.decision);
    return NextResponse.json({ ok });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/item/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
