import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import {
  addVinhetaToPasta,
  createVinhetaPasta,
  listVinhetaPastas,
} from "@/lib/criacao/vinhetaPastaService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const pastas = await listVinhetaPastas(id);
    return NextResponse.json({ pastas });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: programacaoId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      nome?: string;
      vinhetaPastaId?: string;
      vinhetaId?: string;
    };
    if (body.action === "add_vinheta") {
      const pastaId = String(body.vinhetaPastaId ?? "").trim();
      const vinhetaId = String(body.vinhetaId ?? "").trim();
      if (!pastaId || !vinhetaId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
      await addVinhetaToPasta(pastaId, vinhetaId);
    } else {
      const nome = String(body.nome ?? "").trim();
      const created = await createVinhetaPasta(programacaoId, nome);
      await abrirProgramacaoAposMusica(programacaoId, session.displayName ?? session.email);
      return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
    }
    await abrirProgramacaoAposMusica(programacaoId, session.displayName ?? session.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
