import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  enviarPedidoCliente,
  getPedidoCliente,
  importPedidoToRio,
  parsePedidoBody,
  syncPedidoToProducaoCadastro,
  updatePedidoCliente,
} from "@/lib/cadastros/pedidoClienteService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const pedido = await getPedidoCliente(id);
    if (!pedido) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, pedido });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;
    const pedido = await updatePedidoCliente(id, parsePedidoBody(body));
    return NextResponse.json({ ok: true, pedido });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "pedido_cancelado") return NextResponse.json({ error: msg }, { status: 409 });
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[pedidos-cliente PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    const { id } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "enviar") {
      const pedido = await enviarPedidoCliente(id, userCtx);
      return NextResponse.json({ ok: true, pedido });
    }

    if (action === "importar_rio") {
      if (!userHasRole(session.roles, "cobranca") && !userHasRole(session.roles, "master")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const pedido = await importPedidoToRio(id, userCtx);
      return NextResponse.json({ ok: true, pedido });
    }

    if (action === "atualizar_producao") {
      const existing = await getPedidoCliente(id);
      if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (typeof body.pedido === "object" && body.pedido) {
        await updatePedidoCliente(id, parsePedidoBody(body.pedido as Record<string, unknown>));
      }
      const pedido = await syncPedidoToProducaoCadastro(id);
      return NextResponse.json({ ok: true, pedido });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "cliente_rio_nao_encontrado") {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg === "cliente_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "pdv_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "cnpj_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "cep_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "endereco_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "bairro_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "cidade_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "uf_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "contato_loja_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "whatsapp_loja_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "email_loja_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "pdv_rio_invalido") return NextResponse.json({ error: msg }, { status: 409 });
    if (msg === "pedido_cancelado") return NextResponse.json({ error: msg }, { status: 409 });
    if (msg === "rio_month_not_found") return NextResponse.json({ error: msg }, { status: 409 });
    console.error("[pedidos-cliente POST action]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
