import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { appendDownloadJobItems } from "@/lib/criacao/downloadService";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id: jobId } = await ctx.params;

    let body: { linhas?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (!body.linhas?.trim()) {
      return NextResponse.json({ error: "linhas_vazias" }, { status: 400 });
    }

    try {
      const result = await appendDownloadJobItems({ jobId, linhas: body.linhas });
      return NextResponse.json({
        ok: true,
        jobId: result.job.id,
        added: result.added,
        totalItens: result.job.totalItens,
        itensErro: result.itensErro,
        itensPick: result.itensPick,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "job_not_found") {
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        if (err.message === "job_fechado") {
          return NextResponse.json({ error: "job_fechado" }, { status: 409 });
        }
        if (err.message === "nenhuma_linha") {
          return NextResponse.json({ error: "nenhuma_linha" }, { status: 400 });
        }
      }
      throw err;
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/:id/append POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
