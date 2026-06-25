import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getJobDetail } from "@/lib/criacao/filaService";
import { listFaixasEdicao } from "@/lib/criacao/edicaoService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const job = await getJobDetail(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const musicaIds = job.itens
      .filter((i) => i.status === "concluido" && i.musicaId)
      .map((i) => i.musicaId as string);

    const faixas = musicaIds.length > 0 ? await listFaixasEdicao({ musicaIds }) : [];

    return NextResponse.json({
      job: {
        id: job.id,
        titulo: job.titulo,
        status: job.status,
        clienteNome: job.clienteNome,
        uploadTagNome: job.uploadTagNome,
        pastaNome: job.pastaNome,
        programacaoNome: job.programacaoNome,
      },
      faixas,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/:id/revisao-faixas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
