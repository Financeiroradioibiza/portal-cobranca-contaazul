import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { generateMissingClientePlayerLoginsBatch } from "@/lib/player/clientePlayerLoginService";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      sync?: boolean;
      offset?: number;
      limit?: number;
    };

    const result = await generateMissingClientePlayerLoginsBatch({
      offset: body.offset,
      limit: body.limit,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[suporte/logins-clientes/generate POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
