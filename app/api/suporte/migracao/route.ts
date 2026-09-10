import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listMigracaoClientes } from "@/lib/suporte/migracaoService";
import { setMigracaoPrioridadeForCliente } from "@/lib/suporte/migracaoPrioridade";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const result = await listMigracaoClientes();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "falhou" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      rows: result.rows,
      cloud2Ok: result.cloud2Ok,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/migracao GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await req.json()) as { clienteRef?: string; prioridade?: number | null };
    const clienteRef = String(body.clienteRef ?? "").trim();
    if (!clienteRef) {
      return NextResponse.json({ ok: false, error: "cliente_ref_obrigatorio" }, { status: 400 });
    }

    let prioridade: number | null = null;
    if (body.prioridade != null) {
      const n = Number(body.prioridade);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "prioridade_invalida" }, { status: 400 });
      }
      prioridade = Math.trunc(n);
    }

    const map = await setMigracaoPrioridadeForCliente(
      clienteRef,
      prioridade,
      session.email,
    );

    return NextResponse.json({
      ok: true,
      clienteRef,
      prioridade: map[clienteRef] ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/migracao PATCH]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
