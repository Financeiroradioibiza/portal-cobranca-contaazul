import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { unassignTag } from "@/lib/criacao/tagService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; tagId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id, tagId } = await ctx.params;
    await unassignTag(id, tagId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/musicas/:id/tags/:tagId DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
