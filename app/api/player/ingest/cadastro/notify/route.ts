import { NextResponse } from "next/server";
import { getPlayerIngest } from "@/lib/player/playerIngestService";
import { sendPlayerCadastroNotifyEmail } from "@/lib/player/playerCadastroNotifyEmail";

function authorizeIngest(request: Request): boolean {
  const secret = process.env.PLAYER_INGEST_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("x-player-ingest-secret")?.trim();
  return header === secret;
}

/** Callback cloud2 → portal para enviar e-mail após insert direto no Neon. */
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

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
    }

    const row = await getPlayerIngest(id);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (row.tipo !== "cadastro") {
      return NextResponse.json({ error: "tipo_invalido" }, { status: 400 });
    }

    const sent = await sendPlayerCadastroNotifyEmail(row);
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    console.error("[player/ingest/cadastro/notify POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
