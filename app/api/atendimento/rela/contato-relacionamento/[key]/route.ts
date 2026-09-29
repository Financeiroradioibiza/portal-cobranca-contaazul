import { NextResponse } from "next/server";
import {
  upsertRelaContatoRelacionamento,
  type RelaContatoRelacionamento,
} from "@/lib/atendimento/relaContatoRelacionamentoService";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ key: string }> };

export async function PUT(request: Request, ctx: RouteCtx) {
  try {
    requirePortalSession(await getPortalSession());
    const { key } = await ctx.params;
    const body = (await request.json()) as Partial<RelaContatoRelacionamento>;
    const contato = await upsertRelaContatoRelacionamento(decodeURIComponent(key), {
      nome: String(body.nome ?? ""),
      whatsapp: String(body.whatsapp ?? ""),
      email: String(body.email ?? ""),
    });
    return NextResponse.json({ ok: true, contato });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    if (msg === "not_found") {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }
    console.error("[atendimento/rela/contato-relacionamento PUT]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
