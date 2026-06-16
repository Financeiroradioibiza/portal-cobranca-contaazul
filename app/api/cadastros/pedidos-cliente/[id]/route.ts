import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  enviarPedidoCliente,
  getPedidoCliente,
  importPedidoToRio,
  parsePdvsArray,
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

    const pedido = await updatePedidoCliente(id, {
      nomeFantasia: typeof body.nomeFantasia === "string" ? body.nomeFantasia : undefined,
      razaoSocial: typeof body.razaoSocial === "string" ? body.razaoSocial : undefined,
      documento: typeof body.documento === "string" ? body.documento : undefined,
      emailCobranca: typeof body.emailCobranca === "string" ? body.emailCobranca : undefined,
      origemCliente: typeof body.origemCliente === "string" ? body.origemCliente : undefined,
      valorPdvUnitarioTexto:
        typeof body.valorPdvUnitarioTexto === "string" ? body.valorPdvUnitarioTexto : undefined,
      numeroPdvSite: typeof body.numeroPdvSite === "number" ? body.numeroPdvSite : undefined,
      categoriaSite: typeof body.categoriaSite === "string" ? body.categoriaSite : undefined,
      observacoesCliente: typeof body.observacoesCliente === "string" ? body.observacoesCliente : undefined,
      rioGrupoId: body.rioGrupoId === null ? null : typeof body.rioGrupoId === "string" ? body.rioGrupoId : undefined,
      grupoSite: typeof body.grupoSite === "string" ? body.grupoSite : undefined,
      pdvs: body.pdvs !== undefined ? parsePdvsArray(body.pdvs) : undefined,
      prospectId: body.prospectId === null ? null : typeof body.prospectId === "string" ? body.prospectId : undefined,
    });
    return NextResponse.json({ ok: true, pedido });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "pedido_importado") return NextResponse.json({ error: msg }, { status: 409 });
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

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "rio_month_not_found") return NextResponse.json({ error: msg }, { status: 409 });
    console.error("[pedidos-cliente POST action]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
