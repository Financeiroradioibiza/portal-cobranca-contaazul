import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { createTag, listTags } from "@/lib/criacao/tagService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const tags = await listTags();
    return NextResponse.json({ tags });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/tags GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { nome?: string; cor?: string };
    const created = await createTag({
      nome: body.nome ?? "",
      cor: body.cor,
      criativoUserId: session.email,
      criativoNome: session.displayName ?? session.email,
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.includes("Unique")) return NextResponse.json({ error: "tag_duplicada" }, { status: 409 });
    console.error("[criacao/tags POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
