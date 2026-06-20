import { NextResponse } from "next/server";
import { ingestPlayerCadastro } from "@/lib/player/playerIngestService";

function authorizeIngest(request: Request): boolean {
  const secret = process.env.PLAYER_INGEST_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("x-player-ingest-secret")?.trim();
  return header === secret;
}

export async function POST(request: Request) {
  if (!authorizeIngest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const clienteNome =
      typeof body.nome_cliente === "string" ? body.nome_cliente
      : typeof body.clienteNome === "string" ? body.clienteNome
      : "";
    const pdvNome =
      typeof body.nome_pdv === "string" ? body.nome_pdv
      : typeof body.pdvNome === "string" ? body.pdvNome
      : "";
    const clienteGatewayId = Number(body.cliente_id ?? body.clienteGatewayId);
    const pdvGatewayId = Number(body.pdv_id ?? body.pdvGatewayId);
    const payload =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ?
        (body.payload as Record<string, unknown>)
      : body;

    const row = await ingestPlayerCadastro({
      clienteNome,
      pdvNome,
      clienteGatewayId: Number.isFinite(clienteGatewayId) ? clienteGatewayId : null,
      pdvGatewayId: Number.isFinite(pdvGatewayId) ? pdvGatewayId : null,
      payload,
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    if (e instanceof Error && e.message === "mensagem_curta") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[player/ingest/cadastro POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
