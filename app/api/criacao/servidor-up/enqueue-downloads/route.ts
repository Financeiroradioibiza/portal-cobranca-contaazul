import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { providerConfigured } from "@/lib/criacao/downloadConfig";
import {
  appendDownloadJobItems,
  createDownloadJob,
  triggerDownloadProcessing,
} from "@/lib/criacao/downloadService";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      titulo?: string;
      lines?: string[];
      jobId?: string;
      skipProcessing?: boolean;
      processLimit?: number;
    };
    const lines = (body.lines ?? []).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ error: "lines_vazias" }, { status: 400 });
    }
    if (!providerConfigured("deemix")) {
      return NextResponse.json({ error: "deemix_nao_configurado" }, { status: 503 });
    }

    const appendJobId = (body.jobId ?? "").trim();
    let jobId: string;
    let totalItens: number;
    let itensErro = 0;
    let itensPick = 0;

    if (appendJobId) {
      try {
        const appended = await appendDownloadJobItems({
          jobId: appendJobId,
          linhas: lines.join("\n"),
        });
        jobId = appended.job.id;
        totalItens = appended.job.totalItens;
        itensErro = appended.itensErro;
        itensPick = appended.itensPick;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "server_error";
        if (msg === "job_not_found") {
          return NextResponse.json({ error: "job_nao_encontrado" }, { status: 404 });
        }
        if (msg === "job_fechado") {
          return NextResponse.json({ error: "job_fechado" }, { status: 409 });
        }
        if (msg === "nenhuma_linha") {
          return NextResponse.json({ error: "nenhuma_linha" }, { status: 400 });
        }
        throw e;
      }
    } else {
      const created = await createDownloadJob({
        provider: "deemix",
        titulo: (body.titulo ?? "Servidor UP — migração legado").slice(0, 200),
        linhas: lines.join("\n"),
        criativoNome: session.displayName ?? session.email,
        criativoUserId: session.email,
      });
      jobId = created.job.id;
      totalItens = created.job.totalItens;
      itensErro = created.itensErro;
      itensPick = created.itensPick;
    }

    const skipProcessing = body.skipProcessing !== false;
    let proc: { triggered: boolean; processed?: number; error?: string } = {
      triggered: false,
    };
    if (!skipProcessing) {
      const processLimit = Math.min(15, Math.max(1, body.processLimit ?? 5));
      proc = await triggerDownloadProcessing(processLimit, { timeoutMs: 25_000 }).catch(
        (e: unknown) => ({
          triggered: false,
          error: e instanceof Error ? e.message : "erro_rede",
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      jobId,
      totalItens,
      added: lines.length,
      itensErro,
      itensPick,
      processingTriggered: proc.triggered,
      processingError: proc.error ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nenhuma_linha") {
      return NextResponse.json({ error: "nenhuma_linha" }, { status: 400 });
    }
    console.error("[criacao/servidor-up/enqueue-downloads POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
