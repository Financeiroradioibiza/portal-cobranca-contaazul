import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";

export const runtime = "nodejs";

/** Aplica tags de upload e faixas em pastas pendentes (pós-processamento). Não usar no poll da fila. */
export async function POST() {
  try {
    requirePortalSession(await getPortalSession());
    const [tags, pastas] = await Promise.all([
      applyPendingUploadTags(20).catch((e) => {
        console.error("[criacao/fila/sync-pending] tags", e);
        return 0;
      }),
      applyPendingPastaUploads(20).catch((e) => {
        console.error("[criacao/fila/sync-pending] pastas", e);
        return 0;
      }),
    ]);
    return NextResponse.json({ ok: true, tags, pastas });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/sync-pending POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
