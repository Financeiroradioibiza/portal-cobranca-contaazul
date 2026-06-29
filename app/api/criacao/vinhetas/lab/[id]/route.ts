import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { updateVinhetaLabDraft } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      texto?: string;
      voz?: string;
      vozNome?: string;
      trilhaMusicaId?: string | null;
    };
    const row = await updateVinhetaLabDraft(id, body);
    return NextResponse.json({ ok: true, vinheta: row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nada_para_atualizar") return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
