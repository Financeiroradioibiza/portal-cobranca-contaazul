import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { providerConfigured } from "@/lib/criacao/downloadConfig";
import {
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
    };
    const lines = (body.lines ?? []).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ error: "lines_vazias" }, { status: 400 });
    }
    if (!providerConfigured("deemix")) {
      return NextResponse.json({ error: "deemix_nao_configurado" }, { status: 503 });
    }

    const created = await createDownloadJob({
      provider: "deemix",
      titulo: (body.titulo ?? "Servidor UP — migração legado").slice(0, 200),
      linhas: lines.join("\n"),
      criativoNome: session.displayName ?? session.email,
      criativoUserId: session.email,
    });

    const proc = await triggerDownloadProcessing(Math.min(50, created.job.totalItens + 5), {
      timeoutMs: 8_000,
    }).catch((e: unknown) => ({
      triggered: false,
      error: e instanceof Error ? e.message : "erro_rede",
    }));

    return NextResponse.json({
      ok: true,
      jobId: created.job.id,
      totalItens: created.job.totalItens,
      itensErro: created.itensErro,
      itensPick: created.itensPick,
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
