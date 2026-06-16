import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { parseEstagio, updateProspect } from "@/lib/cadastros/prospectService";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;

    const prospect = await updateProspect(id, {
      nome: typeof body.nome === "string" ? body.nome : undefined,
      cidade: typeof body.cidade === "string" ? body.cidade : undefined,
      estado: typeof body.estado === "string" ? body.estado : undefined,
      unidades: typeof body.unidades === "number" ? body.unidades : undefined,
      origem: typeof body.origem === "string" ? body.origem : undefined,
      statusNota: typeof body.statusNota === "string" ? body.statusNota : undefined,
      valorCentavos: typeof body.valorCentavos === "number" ? body.valorCentavos : undefined,
      estagio: parseEstagio(body.estagio) ?? undefined,
      contatoNome: typeof body.contatoNome === "string" ? body.contatoNome : undefined,
      contatoEmail: typeof body.contatoEmail === "string" ? body.contatoEmail : undefined,
      contatoTelefone: typeof body.contatoTelefone === "string" ? body.contatoTelefone : undefined,
      observacoes: typeof body.observacoes === "string" ? body.observacoes : undefined,
      previewMusicalUrl: typeof body.previewMusicalUrl === "string" ? body.previewMusicalUrl : undefined,
      previewMusicalNota: typeof body.previewMusicalNota === "string" ? body.previewMusicalNota : undefined,
      rioGrupoNome: typeof body.rioGrupoNome === "string" ? body.rioGrupoNome : undefined,
      templateProgramacao: typeof body.templateProgramacao === "string" ? body.templateProgramacao : undefined,
      pedidoClienteId: body.pedidoClienteId === null ? null : typeof body.pedidoClienteId === "string" ? body.pedidoClienteId : undefined,
      registrarContato: body.registrarContato === true,
      enviarProposta: body.enviarProposta === true,
      enviarDemo: body.enviarDemo === true,
      fechar: body.fechar === true,
    });
    return NextResponse.json({ ok: true, prospect });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[prospects PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
