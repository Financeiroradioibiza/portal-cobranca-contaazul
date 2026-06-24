import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { provisionClientePlayerForBucket } from "@/lib/player/provisionClientePlayer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { bucketKey?: string };
    const bucketKey = body.bucketKey?.trim();
    if (!bucketKey) {
      return NextResponse.json({ error: "parametros_invalidos" }, { status: 400 });
    }

    const result = await provisionClientePlayerForBucket(bucketKey);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (
      msg === "parametros_invalidos" ||
      msg === "cliente_nao_encontrado" ||
      msg === "cliente_sem_id_player" ||
      msg === "pdv_sem_id_player"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[player/portal-ids/provision-cliente POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
