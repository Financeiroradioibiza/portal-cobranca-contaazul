import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  createSiteClienteGrupo,
  listSiteClienteGrupos,
} from "@/lib/site-cliente/siteClienteAdminService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const grupos = await listSiteClienteGrupos();
    return NextResponse.json({ ok: true, grupos });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const portal = requirePortalSession(await getPortalSession());
    const body = (await req.json()) as { nome?: string };
    const created = await createSiteClienteGrupo({
      nome: body.nome ?? "",
      createdBy: portal.displayName ?? portal.email ?? "",
    });
    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[suporte/site-clientes POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
