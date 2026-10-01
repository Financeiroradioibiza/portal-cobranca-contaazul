import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { CHAMADO_ANEXO_MAX_BYTES } from "@/lib/chamados/chamadoAnexoLimits";
import { addChamadoAnexo, listChamadoAnexos } from "@/lib/chamados/chamadoAnexoService";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const comentarioParam = url.searchParams.get("comentarioId");
    const anexos =
      comentarioParam === "initial" ?
        await listChamadoAnexos(id, { comentarioId: null })
      : comentarioParam ?
        await listChamadoAnexos(id, { comentarioId: comentarioParam })
      : await listChamadoAnexos(id);
    return NextResponse.json({ ok: true, anexos });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/:id/anexos GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    if (file.size > CHAMADO_ANEXO_MAX_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    const comentarioRaw = form.get("comentarioId");
    const comentarioId =
      comentarioRaw === "initial" || comentarioRaw === "" || comentarioRaw === null ?
        null
      : typeof comentarioRaw === "string" ?
        comentarioRaw
      : null;
    const bytes = Buffer.from(await file.arrayBuffer());
    const anexo = await addChamadoAnexo(
      id,
      { name: file.name, mimeType: file.type, bytes },
      userCtx,
      { comentarioId },
    );
    return NextResponse.json({ ok: true, anexo });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "file_too_large") return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    if (msg === "mime_not_allowed") return NextResponse.json({ error: "mime_not_allowed" }, { status: 415 });
    console.error("[chamados/:id/anexos POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
