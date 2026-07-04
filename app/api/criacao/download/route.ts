import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { providerConfigured } from "@/lib/criacao/downloadConfig";
import {
  createDownloadJob,
  listDownloadJobs,
  listStagingFiles,
  triggerDownloadProcessing,
} from "@/lib/criacao/downloadService";
import { PORTAL_DOWNLOAD_PROVIDERS, type PortalDownloadProviderId } from "@/lib/criacao/downloadParse";

function parseProvider(v: string | null): PortalDownloadProviderId | undefined {
  if (v && (PORTAL_DOWNLOAD_PROVIDERS as readonly string[]).includes(v)) {
    return v as PortalDownloadProviderId;
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const provider = parseProvider(url.searchParams.get("provider"));
    const view = url.searchParams.get("view");

    if (view === "staging") {
      const staging = await listStagingFiles({ provider, limit: 100 });
      return NextResponse.json({ staging });
    }

    const jobs = await listDownloadJobs({ provider, limit: 50 });
    const config = Object.fromEntries(
      PORTAL_DOWNLOAD_PROVIDERS.map((p) => [p, providerConfigured(p)]),
    ) as Record<PortalDownloadProviderId, boolean>;
    return NextResponse.json({ jobs, config });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    let body: { provider?: string; titulo?: string; linhas?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const provider = parseProvider(body.provider ?? null);
    if (!provider) return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
    if (!body.linhas?.trim()) return NextResponse.json({ error: "linhas_vazias" }, { status: 400 });

    let job;
    try {
      job = await createDownloadJob({
        provider,
        titulo: body.titulo,
        linhas: body.linhas,
        criativoNome: session.displayName ?? session.email,
        criativoUserId: session.email,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "nenhuma_linha") {
        return NextResponse.json({ error: "nenhuma_linha" }, { status: 400 });
      }
      throw err;
    }

    const proc = await triggerDownloadProcessing(Math.min(50, job.totalItens + 5));

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      totalItens: job.totalItens,
      processingTriggered: proc.triggered,
      processingError: proc.error ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
