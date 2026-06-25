import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { resolveTagCriativoUser } from "@/lib/criacao/criativoUserService";
import {
  createUploadJob,
  createUploadJobsBatch,
  type UploadArquivo,
  type UploadLoteInput,
} from "@/lib/criacao/filaService";
import { CRIACAO_INGEST_URL, ingestEnabled, signTicket } from "@/lib/criacao/ingestTicket";

export const runtime = "nodejs";

type LoteBody = {
  titulo?: string;
  destinoTipo?: "pasta" | "biblioteca";
  clienteRef?: string;
  clienteNome?: string;
  uploadTagNome?: string;
  programacaoId?: string;
  pastaId?: string;
  arquivos?: UploadArquivo[];
};

function ticketsForJob(jobId: string, itens: { id: string; arquivoNome: string }[]) {
  return itens.map((it) => {
    const { token, exp } = signTicket(it.id, jobId);
    return { itemId: it.id, arquivoNome: it.arquivoNome, token, exp };
  });
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());

    let body: {
      titulo?: string;
      clienteRef?: string;
      clienteNome?: string;
      uploadTagNome?: string;
      tagCriativoUserId?: string;
      programacaoId?: string;
      pastaId?: string;
      arquivos?: UploadArquivo[];
      lotes?: LoteBody[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (!ingestEnabled()) {
      return NextResponse.json({ error: "ingest_desabilitado" }, { status: 503 });
    }

    const tagCriativo = await resolveTagCriativoUser(body.tagCriativoUserId, session.email);
    const criativoNome = session.displayName ?? session.email;
    const criativoUserId = tagCriativo.email;

    const rawLotes = Array.isArray(body.lotes) && body.lotes.length > 0 ? body.lotes : null;

    if (rawLotes) {
      const lotes: UploadLoteInput[] = [];
      for (const l of rawLotes) {
        const arquivos = Array.isArray(l.arquivos) ? l.arquivos.filter((a) => a?.nome?.trim()) : [];
        if (arquivos.length === 0) continue;
        const destinoTipo = l.destinoTipo === "biblioteca" ? "biblioteca" : "pasta";
        lotes.push({
          titulo: (l.titulo || body.titulo || "Upload").slice(0, 200),
          destinoTipo,
          clienteRef: destinoTipo === "pasta" ? l.clienteRef : undefined,
          clienteNome: destinoTipo === "pasta" ? l.clienteNome : undefined,
          programacaoId: destinoTipo === "pasta" ? l.programacaoId : undefined,
          pastaId: destinoTipo === "pasta" ? l.pastaId : undefined,
          uploadTagNome: (l.uploadTagNome || body.uploadTagNome || "").trim() || undefined,
          criativoUserId,
          criativoNome,
          arquivos,
        });
      }
      if (lotes.length === 0) {
        return NextResponse.json({ error: "no_files" }, { status: 400 });
      }

      const jobs = await createUploadJobsBatch(lotes, { criativoNome, criativoUserId });
      return NextResponse.json({
        ok: true,
        ingestUrl: CRIACAO_INGEST_URL,
        jobs: jobs.map((job) => ({
          jobId: job.id,
          titulo: job.titulo,
          tickets: ticketsForJob(job.id, job.itens),
        })),
      });
    }

    // Compat: um job só (formato antigo)
    const arquivos = Array.isArray(body.arquivos) ? body.arquivos : [];
    if (arquivos.length === 0) {
      return NextResponse.json({ error: "no_files" }, { status: 400 });
    }

    const job = await createUploadJob({
      titulo: body.titulo ?? "",
      clienteRef: body.clienteRef,
      clienteNome: body.clienteNome,
      criativoNome,
      criativoUserId,
      uploadTagNome: body.uploadTagNome,
      programacaoId: body.programacaoId,
      pastaId: body.pastaId,
      arquivos,
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      ingestUrl: CRIACAO_INGEST_URL,
      tickets: ticketsForJob(job.id, job.itens),
      jobs: [{ jobId: job.id, titulo: job.titulo, tickets: ticketsForJob(job.id, job.itens) }],
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/upload POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
