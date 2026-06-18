import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { createUploadJob, type UploadArquivo } from "@/lib/criacao/filaService";
import { CRIACAO_INGEST_URL, ingestEnabled, signTicket } from "@/lib/criacao/ingestTicket";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());

    let body: {
      titulo?: string;
      clienteRef?: string;
      clienteNome?: string;
      arquivos?: UploadArquivo[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const arquivos = Array.isArray(body.arquivos) ? body.arquivos : [];
    if (arquivos.length === 0) {
      return NextResponse.json({ error: "no_files" }, { status: 400 });
    }

    if (!ingestEnabled()) {
      return NextResponse.json({ error: "ingest_desabilitado" }, { status: 503 });
    }

    const job = await createUploadJob({
      titulo: body.titulo ?? "",
      clienteRef: body.clienteRef,
      clienteNome: body.clienteNome,
      criativoNome: session.displayName ?? session.email,
      arquivos,
    });

    // Um ticket HMAC por item: o navegador envia o binário DIRETO ao cloud2 (sem Netlify).
    const tickets = job.itens.map((it) => {
      const { token, exp } = signTicket(it.id, job.id);
      return { itemId: it.id, arquivoNome: it.arquivoNome, token, exp };
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      ingestUrl: CRIACAO_INGEST_URL,
      tickets,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/upload POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
