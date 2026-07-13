import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { autoFinishJobsReady } from "@/lib/criacao/filaService";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";
import { applyPendingPastaEspecialUploads } from "@/lib/criacao/pastaEspecialUploadService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";

export const runtime = "nodejs";

/** Aplica tags de upload e faixas em pastas pendentes (pós-processamento). Não usar no poll da fila. */
export async function POST() {
  try {
    requirePortalSession(await getPortalSession());
    const [tags, pastas, pastasEspeciais, jobsFinished] = await Promise.all([
      applyPendingUploadTags(20).catch((e) => {
        console.error("[criacao/fila/sync-pending] tags", e);
        return 0;
      }),
      applyPendingPastaUploads(20).catch((e) => {
        console.error("[criacao/fila/sync-pending] pastas", e);
        return 0;
      }),
      applyPendingPastaEspecialUploads(20).catch((e) => {
        console.error("[criacao/fila/sync-pending] pastas-especiais", e);
        return 0;
      }),
      autoFinishJobsReady().catch((e) => {
        console.error("[criacao/fila/sync-pending] autoFinish", e);
        return 0;
      }),
    ]);
    return NextResponse.json({ ok: true, tags, pastas, pastasEspeciais, jobsFinished });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/sync-pending POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
