import { NextResponse } from "next/server";
import type { VinhetaHorarioFixoTipo } from "@prisma/client";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import {
  deleteVinhetaHorarioFixo,
  listVinhetasHorarioFixo,
  upsertVinhetaHorarioFixo,
} from "@/lib/criacao/programacaoVinhetaHorarioFixoService";
import { syncPastaFlagsProgramacao } from "@/lib/criacao/publicarService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseTipo(raw: unknown): VinhetaHorarioFixoTipo | null {
  return raw === "abertura" || raw === "encerramento" ? raw : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const items = await listVinhetasHorarioFixo(id);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: programacaoId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      tipo?: string;
      hora?: string;
      vinhetaId?: string | null;
      ativo?: boolean;
    };
    const tipo = parseTipo(body.tipo);
    if (!tipo) return NextResponse.json({ error: "tipo_invalido" }, { status: 400 });
    const item = await upsertVinhetaHorarioFixo(programacaoId, tipo, {
      hora: body.hora,
      vinhetaId: body.vinhetaId,
      ativo: body.ativo,
    });
    await abrirProgramacaoAposMusica(programacaoId, session.displayName ?? session.email);
    await syncPastaFlagsProgramacao(programacaoId).catch(() => null);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: programacaoId } = await ctx.params;
    const url = new URL(request.url);
    const tipo = parseTipo(url.searchParams.get("tipo"));
    if (!tipo) return NextResponse.json({ error: "tipo_invalido" }, { status: 400 });
    await deleteVinhetaHorarioFixo(programacaoId, tipo);
    await abrirProgramacaoAposMusica(programacaoId, session.displayName ?? session.email);
    await syncPastaFlagsProgramacao(programacaoId).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
