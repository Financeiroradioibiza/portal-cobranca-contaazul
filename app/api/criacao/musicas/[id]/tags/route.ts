import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { assignTag } from "@/lib/criacao/tagService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { tagId?: string };
    if (!body.tagId) return NextResponse.json({ error: "tagId_obrigatorio" }, { status: 400 });
    await assignTag(id, body.tagId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/musicas/:id/tags POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
