import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listClientesRelacionamento } from "@/lib/clientes/clientesRelacionamentoService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    const payload = await listClientesRelacionamento(q);
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[clientes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
