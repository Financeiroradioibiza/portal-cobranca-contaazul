import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listFaixasEdicao } from "@/lib/criacao/edicaoService";
import { getJobDetail } from "@/lib/criacao/filaService";
import { musicaIdsParaRevisaoEdicao } from "@/lib/criacao/revisaoFaixasService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const job = await getJobDetail(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (job.status === "revisao") {
      try {
        await applyPendingUploadTags(200);
      } catch (e) {
        console.error("[criacao/fila/:id/revisao-faixas] upload tags", e);
      }
    }

    const musicaIds = musicaIdsParaRevisaoEdicao(job.itens);
    const faixas =
      musicaIds.length > 0 ?
        await listFaixasEdicao({ musicaIds, revisao: true })
      : [];

    const itensRevisaoEdicao = job.itens.filter(
      (i) => musicaIds.includes(i.musicaId ?? ""),
    ).length;
    const itensDuplicataDescartada = job.itens.filter((i) =>
      (i.erroMsg ?? "").startsWith("Descartada (duplicata confirmada)"),
    ).length;

    return NextResponse.json({
      job: {
        id: job.id,
        titulo: job.titulo,
        status: job.status,
        clienteNome: job.clienteNome,
        uploadTagNome: job.uploadTagNome,
        pastaNome: job.pastaNome,
        programacaoNome: job.programacaoNome,
        criativoNome: job.criativoNome,
      },
      faixas,
      itensRevisaoEdicao,
      itensDuplicataDescartada,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/:id/revisao-faixas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
