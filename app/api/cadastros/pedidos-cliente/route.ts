import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  createPedidoCliente,
  listPedidosCliente,
  parsePedidoBody,
} from "@/lib/cadastros/pedidoClienteService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const pedidos = await listPedidosCliente();
    return NextResponse.json({ ok: true, pedidos });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[pedidos-cliente GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const input = parsePedidoBody(body);
    const pedido = await createPedidoCliente(
      { ...input, nomeFantasia: input.nomeFantasia ?? "" },
      ctx,
    );
    return NextResponse.json({ ok: true, pedido });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[pedidos-cliente POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
