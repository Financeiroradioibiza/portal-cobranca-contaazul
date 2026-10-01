import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  listChamadoComentarios,
  postChamadoComentario,
} from "@/lib/chamados/chamadoComentarioService";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { CHAMADO_ANEXO_MAX_BYTES } from "@/lib/chamados/chamadoAnexoLimits";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const comentarios = await listChamadoComentarios(id, session.email);
    return NextResponse.json({ ok: true, comentarios });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/:id/comentarios GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const { id } = await ctx.params;
    const contentType = req.headers.get("content-type") ?? "";
    let corpo = "";
    const filePayloads: { name: string; mimeType: string; bytes: Buffer }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      corpo = String(form.get("corpo") ?? "");
      for (const entry of form.getAll("files")) {
        if (!(entry instanceof File) || entry.size <= 0) continue;
        if (entry.size > CHAMADO_ANEXO_MAX_BYTES) {
          return NextResponse.json({ error: "file_too_large" }, { status: 413 });
        }
        filePayloads.push({
          name: entry.name,
          mimeType: entry.type,
          bytes: Buffer.from(await entry.arrayBuffer()),
        });
      }
    } else {
      let body: { corpo?: string };
      try {
        body = (await req.json()) as { corpo?: string };
      } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      corpo = body.corpo ?? "";
    }

    const comentario = await postChamadoComentario(id, corpo, userCtx, filePayloads);
    return NextResponse.json({ ok: true, comentario });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "corpo_vazio") return NextResponse.json({ error: "corpo_vazio" }, { status: 400 });
    if (msg === "file_too_large" || msg === "mime_not_allowed") {
      return NextResponse.json({ error: msg }, { status: 415 });
    }
    console.error("[chamados/:id/comentarios POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
