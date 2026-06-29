import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { deleteVinhetaTrilha } from "@/lib/criacao/vinhetaTrilhaService";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await params;
    await deleteVinhetaTrilha(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "trilha_em_uso") return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
