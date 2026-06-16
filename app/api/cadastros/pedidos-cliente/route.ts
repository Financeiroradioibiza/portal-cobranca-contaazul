import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  createPedidoCliente,
  listPedidosCliente,
  parsePdvsArray,
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
    const pedido = await createPedidoCliente(
      {
        nomeFantasia: str(body.nomeFantasia),
        razaoSocial: str(body.razaoSocial),
        documento: str(body.documento),
        emailCobranca: str(body.emailCobranca),
        origemCliente: str(body.origemCliente),
        valorPdvUnitarioTexto: str(body.valorPdvUnitarioTexto),
        numeroPdvSite: typeof body.numeroPdvSite === "number" ? body.numeroPdvSite : undefined,
        categoriaSite: str(body.categoriaSite),
        observacoesCliente: str(body.observacoesCliente),
        rioGrupoId: typeof body.rioGrupoId === "string" ? body.rioGrupoId : null,
        grupoSite: str(body.grupoSite),
        pdvs: parsePdvsArray(body.pdvs),
        prospectId: typeof body.prospectId === "string" ? body.prospectId : null,
      },
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

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
