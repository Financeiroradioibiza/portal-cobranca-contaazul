import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { buildUploadJobTextLog } from "@/lib/criacao/uploadLogService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const log = await buildUploadJobTextLog(id);
    if (!log) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return new NextResponse(log, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="upload-log-${id.slice(0, 12)}.txt"`,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/:id/upload-log GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
