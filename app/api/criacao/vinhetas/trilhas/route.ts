import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession, requireVinhetaConfigSession } from "@/lib/auth/portalAccess";
import { normalizePortalEmail } from "@/lib/auth/users";
import { createVinhetaTrilha, listVinhetaTrilhas } from "@/lib/criacao/vinhetaTrilhaService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const trilhas = await listVinhetaTrilhas();
    return NextResponse.json({ ok: true, trilhas });
  } catch (e) {
    if (e instanceof Response) return e;
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[criacao/vinhetas/trilhas GET]", detail, e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireVinhetaConfigSession();
    const body = (await request.json().catch(() => ({}))) as { nome?: string };
    const payload = await createVinhetaTrilha({
      nome: body.nome ?? "",
      uploadedBy: normalizePortalEmail(session.email),
      uploadedByNome: session.displayName ?? session.email,
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
