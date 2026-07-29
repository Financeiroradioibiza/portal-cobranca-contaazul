import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  getServidorUpPreviewCompareStatus,
  startServidorUpPreviewCompare,
} from "@/lib/criacao/servidorUpPreviewCompareService";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const itemId = new URL(request.url).searchParams.get("itemId")?.trim() ?? "";
    if (!itemId) {
      return NextResponse.json({ error: "item_id_obrigatorio" }, { status: 400 });
    }
    const status = await getServidorUpPreviewCompareStatus(itemId);
    if (!status) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/preview-compare GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      deezerUrl?: string;
      previewJobId?: string;
    };

    const deezerUrl = (body.deezerUrl ?? "").trim();
    if (!deezerUrl) {
      return NextResponse.json({ error: "deezer_url_obrigatoria" }, { status: 400 });
    }

    const result = await startServidorUpPreviewCompare({
      deezerUrl,
      previewJobId: body.previewJobId,
      criativoNome: session.displayName ?? session.email,
      criativoUserId: session.email,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "deezer_url_obrigatoria" || msg === "nenhuma_linha") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "job_not_found" || msg === "job_fechado") {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    console.error("[criacao/servidor-up/preview-compare POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
