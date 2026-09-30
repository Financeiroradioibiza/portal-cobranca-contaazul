import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { CHAMADO_ANEXO_MAX_BYTES } from "@/lib/chamados/chamadoAnexoLimits";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { listConversaMensagens, postConversaMensagem } from "@/lib/chamados/conversaService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const mensagens = await listConversaMensagens(id);
    return NextResponse.json({ ok: true, mensagens });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/conversas/:id/mensagens GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const corpo = String(form.get("corpo") ?? "");
      const files: { name: string; mimeType: string; bytes: Buffer }[] = [];
      const candidates = [...form.getAll("files"), ...form.getAll("file")];
      for (const val of candidates) {
        if (!(val instanceof File) || val.size <= 0) continue;
        if (val.size > CHAMADO_ANEXO_MAX_BYTES) {
          return NextResponse.json({ error: "file_too_large" }, { status: 413 });
        }
        const buf = Buffer.from(await val.arrayBuffer());
        files.push({
          name: val.name || "anexo",
          mimeType: val.type || "application/octet-stream",
          bytes: buf,
        });
      }
      const mensagem = await postConversaMensagem(id, corpo, userCtx, files);
      return NextResponse.json({ ok: true, mensagem });
    }

    const body = (await req.json()) as { corpo?: string };
    const mensagem = await postConversaMensagem(id, body.corpo ?? "", userCtx, []);
    return NextResponse.json({ ok: true, mensagem });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "corpo_vazio") return NextResponse.json({ error: "corpo_vazio" }, { status: 400 });
    if (msg === "file_too_large") return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    if (msg === "mime_not_allowed") return NextResponse.json({ error: "mime_not_allowed" }, { status: 415 });
    console.error("[chamados/conversas/:id/mensagens POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
