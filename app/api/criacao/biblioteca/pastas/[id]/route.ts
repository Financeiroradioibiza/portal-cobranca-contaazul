import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  deleteBibliotecaPasta,
  updateBibliotecaPasta,
} from "@/lib/criacao/bibliotecaPastaService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      cor?: string;
      icone?: string;
      sortOrder?: number;
    };
    const pasta = await updateBibliotecaPasta(id, body);
    if (!pasta) return NextResponse.json({ error: "sem_alteracao" }, { status: 400 });
    return NextResponse.json({ pasta });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/pastas PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    await deleteBibliotecaPasta(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/pastas DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
