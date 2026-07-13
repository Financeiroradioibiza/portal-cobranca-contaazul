import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { resolveTagCriativoUser } from "@/lib/criacao/criativoUserService";
import {
  createUploadJob,
  createUploadJobsBatch,
  type UploadArquivo,
  type UploadLoteInput,
} from "@/lib/criacao/filaService";
import { markCriativoEntregueAuto, markSubidaFilaPainel } from "@/lib/criacao/atualizacaoPainelService";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { CRIACAO_INGEST_URL, ingestEnabled, signTicket } from "@/lib/criacao/ingestTicket";
import { ingestFromStagingOnCloud2 } from "@/lib/criacao/ingestFromStaging";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function stagingProcessamentoNome(dl: {
  arquivoNome: string;
  titulo: string;
  artista: string;
}): string {
  const artista = dl.artista.trim();
  const titulo = dl.titulo.trim();
  if (artista && titulo) return `${artista} - ${titulo}.mp3`.slice(0, 500);
  const arquivo = dl.arquivoNome.trim();
  if (arquivo) return arquivo.slice(0, 500);
  return `${titulo || "faixa"}.mp3`.slice(0, 500);
}

async function normalizeUploadArquivos(arquivos: UploadArquivo[]): Promise<UploadArquivo[]> {
  const out: UploadArquivo[] = [];
  for (const a of arquivos) {
    if (!a?.nome?.trim() && !a.downloadItemId) continue;
    if (a.downloadItemId) {
      const dl = await prisma.downloadItem.findFirst({
        where: {
          id: a.downloadItemId,
          status: "concluido",
          storageKey: { not: null },
          NOT: { providerRef: { startsWith: "import:" } },
        },
        select: { id: true, arquivoNome: true, titulo: true, artista: true, sizeBytes: true },
      });
      if (!dl) throw new Error("staging_item_invalido");
      const nome = stagingProcessamentoNome(dl);
      out.push({
        nome,
        sizeBytes: dl.sizeBytes ?? a.sizeBytes,
        downloadItemId: dl.id,
      });
      continue;
    }
    out.push({ nome: a.nome.trim().slice(0, 500), sizeBytes: a.sizeBytes });
  }
  return out;
}

function buildStagingPairs(
  jobs: Array<{ id: string; itens: { id: string; arquivoNome: string }[] }>,
  lotes: UploadLoteInput[],
) {
  const pairs: { processamentoItemId: string; downloadItemId: string }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const arquivos = lotes[i]?.arquivos ?? [];
    for (let j = 0; j < job.itens.length; j++) {
      const dlId = arquivos[j]?.downloadItemId;
      if (dlId) {
        pairs.push({ processamentoItemId: job.itens[j]!.id, downloadItemId: dlId });
      }
    }
  }
  return pairs;
}

type LoteBody = {
  titulo?: string;
  destinoTipo?: "pasta" | "biblioteca" | "pasta_especial";
  clienteRef?: string;
  clienteNome?: string;
  uploadTagNome?: string;
  tagCriativoUserId?: string;
  programacaoId?: string;
  pastaId?: string;
  pastaEspecialId?: string;
  arquivos?: UploadArquivo[];
  downloadItemIds?: string[];
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

    const tagCriativoDefault = await resolveTagCriativoUser(body.tagCriativoUserId, session.email);
    const uploaderNome = session.displayName ?? session.email;

    const rawLotes = Array.isArray(body.lotes) && body.lotes.length > 0 ? body.lotes : null;

    if (rawLotes) {
      const lotes: UploadLoteInput[] = [];
      for (const l of rawLotes) {
        let arquivos = Array.isArray(l.arquivos) ? l.arquivos.filter((a) => a?.nome?.trim() || a?.downloadItemId) : [];
        if (arquivos.length === 0 && Array.isArray(l.downloadItemIds) && l.downloadItemIds.length > 0) {
          arquivos = l.downloadItemIds.map((id) => ({ nome: "", downloadItemId: id }));
        }
        try {
          arquivos = await normalizeUploadArquivos(arquivos);
        } catch {
          return NextResponse.json({ error: "staging_item_invalido" }, { status: 400 });
        }
        if (arquivos.length === 0) continue;
        const destinoTipo =
          l.destinoTipo === "biblioteca" ? "biblioteca"
          : l.destinoTipo === "pasta_especial" ? "pasta_especial"
          : "pasta";
        const tagCriativo = await resolveTagCriativoUser(
          l.tagCriativoUserId ?? body.tagCriativoUserId,
          session.email,
        );
        lotes.push({
          titulo: (l.titulo || body.titulo || "Upload").slice(0, 200),
          destinoTipo,
          clienteRef: destinoTipo === "pasta" ? l.clienteRef : undefined,
          clienteNome: destinoTipo === "pasta" ? l.clienteNome : undefined,
          programacaoId: destinoTipo === "pasta" ? l.programacaoId : undefined,
          pastaId: destinoTipo === "pasta" ? l.pastaId : undefined,
          pastaEspecialId: destinoTipo === "pasta_especial" ? l.pastaEspecialId : undefined,
          uploadTagNome: (l.uploadTagNome || body.uploadTagNome || "").trim() || undefined,
          criativoUserId: tagCriativo.email,
          criativoNome: tagCriativo.displayName,
          arquivos,
        });
      }
      if (lotes.length === 0) {
        return NextResponse.json({ error: "no_files" }, { status: 400 });
      }

      const jobs = await createUploadJobsBatch(lotes, {
        criativoNome: uploaderNome,
        criativoUserId: tagCriativoDefault.email,
      });
      for (const job of jobs) {
        if (job.programacaoId) {
          await markSubidaFilaPainel(job.programacaoId, job.id, uploaderNome);
          await markCriativoEntregueAuto(job.programacaoId, uploaderNome);
          await abrirProgramacaoAposMusica(job.programacaoId, uploaderNome);
        }
      }

      const stagingPairs = buildStagingPairs(jobs, lotes);
      let stagingImported = 0;
      let stagingErrors: string[] = [];
      if (stagingPairs.length > 0) {
        const stagingResult = await ingestFromStagingOnCloud2(stagingPairs);
        stagingImported = stagingResult.imported;
        stagingErrors = stagingResult.errors;
        if (!stagingResult.ok && stagingImported === 0) {
          return NextResponse.json(
            { error: "staging_import_falhou", message: stagingErrors.join(" · ") },
            { status: 502 },
          );
        }
      }

      return NextResponse.json({
        ok: true,
        ingestUrl: CRIACAO_INGEST_URL,
        stagingImported,
        stagingErrors,
        jobs: jobs.map((job, idx) => ({
          jobId: job.id,
          titulo: job.titulo,
          tickets: ticketsForJob(
            job.id,
            job.itens.filter((it, j) => !lotes[idx]?.arquivos[j]?.downloadItemId),
          ),
        })),
      });
    }

    // Compat: um job só (formato antigo)
    const arquivos = Array.isArray(body.arquivos) ? body.arquivos : [];
    if (arquivos.length === 0) {
      return NextResponse.json({ error: "no_files" }, { status: 400 });
    }

    const tagCriativo = await resolveTagCriativoUser(body.tagCriativoUserId, session.email);
    const criativoNome = tagCriativo.displayName;
    const criativoUserId = tagCriativo.email;

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

    if (job.programacaoId) {
      await markSubidaFilaPainel(job.programacaoId, job.id, uploaderNome);
      await markCriativoEntregueAuto(job.programacaoId, uploaderNome);
      await abrirProgramacaoAposMusica(job.programacaoId, uploaderNome);
    }

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
