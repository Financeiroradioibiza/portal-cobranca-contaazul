import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getDuplicataCompare } from "@/lib/criacao/duplicataCompareService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const compare = await getDuplicataCompare(id);
    if (!compare) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ compare });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/item/:id/duplicata-compare GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
