import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { resolveTagCriativoUser } from "@/lib/criacao/criativoUserService";
import { markCriativoEntregueAuto, markSubidaFilaPainel } from "@/lib/criacao/atualizacaoPainelService";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { createUploadJobsBatch, type UploadLoteInput } from "@/lib/criacao/filaService";
import { ingestFromStagingOnCloud2 } from "@/lib/criacao/ingestFromStaging";
import { CRIACAO_INGEST_URL, ingestEnabled } from "@/lib/criacao/ingestTicket";
import {
  buildServidorUpUploadPlan,
  servidorUpPlanToUploadLotes,
  type ServidorUpUploadDraftInput,
  type ServidorUpUploadTrackInput,
} from "@/lib/criacao/servidorUpUploadService";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";
import { appendLegacyMixSuffixToMp3Nome } from "@/lib/criacao/legacyMixFilename";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

async function normalizeUploadArquivos(
  arquivos: Array<{
    nome?: string;
    sizeBytes?: number;
    downloadItemId?: string;
    mixSegundosFromLegacy?: number;
  }>,
) {
  const out: Array<{ nome: string; sizeBytes?: number; downloadItemId?: string }> = [];
  for (const a of arquivos) {
    if (!a.downloadItemId && !a.nome?.trim()) continue;
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
      const artista = dl.artista.trim();
      const titulo = dl.titulo.trim();
      let nome =
        artista && titulo ? `${artista} - ${titulo}.mp3`.slice(0, 500)
        : dl.arquivoNome.trim() ?
          dl.arquivoNome.slice(0, 500)
        : `${titulo || "faixa"}.mp3`.slice(0, 500);
      if (a.mixSegundosFromLegacy != null) {
        nome = appendLegacyMixSuffixToMp3Nome(nome, a.mixSegundosFromLegacy);
      }
      out.push({ nome, sizeBytes: dl.sizeBytes ?? a.sizeBytes, downloadItemId: dl.id });
      continue;
    }
    out.push({ nome: a.nome!.trim().slice(0, 500), sizeBytes: a.sizeBytes });
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
      if (dlId) pairs.push({ processamentoItemId: job.itens[j]!.id, downloadItemId: dlId });
    }
  }
  return pairs;
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!ingestEnabled()) {
      return NextResponse.json({ error: "ingest_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      downloadJobId?: string;
      titulo?: string;
      hierarchyRows?: ServidorUpHierarchyRow[];
      drafts?: Record<string, ServidorUpUploadDraftInput>;
      tracks?: ServidorUpUploadTrackInput[];
    };

    const downloadJobId = (body.downloadJobId ?? "").trim();
    const hierarchyRows = Array.isArray(body.hierarchyRows) ? body.hierarchyRows : [];
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    const titulo = (body.titulo ?? "Servidor UP — migração legado").slice(0, 200);

    if (!downloadJobId) {
      return NextResponse.json({ error: "download_job_obrigatorio" }, { status: 400 });
    }
    if (tracks.length === 0) {
      return NextResponse.json({ error: "tracks_vazios" }, { status: 400 });
    }

    const plan = await buildServidorUpUploadPlan({
      downloadJobId,
      hierarchyRows,
      drafts: body.drafts,
      tracks,
    });

    if (plan.hierarchyErrors.length > 0) {
      return NextResponse.json(
        { error: "hierarquia_incompleta", messages: plan.hierarchyErrors.slice(0, 10) },
        { status: 409 },
      );
    }

    const rawLotes = servidorUpPlanToUploadLotes(plan, titulo);
    if (rawLotes.length === 0) {
      return NextResponse.json(
        {
          error: "nenhuma_faixa_mapeada",
          unmatched: plan.unmatchedTracks.slice(0, 20),
        },
        { status: 400 },
      );
    }

    const tagCriativoDefault = await resolveTagCriativoUser(undefined, session.email);
    const uploaderNome = session.displayName ?? session.email;

    const lotes: UploadLoteInput[] = [];
    for (const l of rawLotes) {
      let arquivos = l.arquivos ?? [];
      arquivos = await normalizeUploadArquivos(arquivos);
      if (arquivos.length === 0) continue;
      const tagCriativo = await resolveTagCriativoUser(l.criativoUserId, session.email);
      lotes.push({
        ...l,
        arquivos,
        criativoUserId: tagCriativo.email,
        criativoNome: tagCriativo.displayName,
      });
    }

    if (lotes.length === 0) {
      return NextResponse.json({ error: "staging_item_invalido" }, { status: 400 });
    }

    const jobs = await createUploadJobsBatch(lotes, {
      criativoNome: uploaderNome,
      criativoUserId: tagCriativoDefault.email,
    });

    for (const job of jobs) {
      if (job.programacaoId) {
        await markSubidaFilaPainel(job.programacaoId, job.id, uploaderNome);
        await markCriativoEntregueAuto(job.programacaoId, uploaderNome);
      }
    }

    const por = session.displayName ?? session.email;
    for (const progId of new Set(jobs.map((j) => j.programacaoId).filter(Boolean) as string[])) {
      await abrirAtualizacao(progId, por);
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
      jobIds: jobs.map((j) => j.id),
      stats: {
        lotes: lotes.length,
        tracks: stagingImported,
        unmatched: plan.unmatchedTracks.length,
      },
      unmatched: plan.unmatchedTracks.slice(0, 30),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "staging_item_invalido") {
      return NextResponse.json({ error: "staging_item_invalido" }, { status: 400 });
    }
    console.error("[criacao/servidor-up/enqueue-upload POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
