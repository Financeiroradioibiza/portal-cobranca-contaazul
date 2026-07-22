import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  autoFinishJobsReady,
  reconcileStuckProcessingJobs,
  recoverStagingForPendingItems,
  resetStaleProcessingItems,
} from "@/lib/criacao/filaService";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";
import { applyPendingPastaEspecialUploads } from "@/lib/criacao/pastaEspecialUploadService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";

export const runtime = "nodejs";

/** Aplica tags de upload e faixas em pastas pendentes (pós-processamento). Não usar no poll da fila. */
export async function POST() {
  try {
    requirePortalSession(await getPortalSession());
    const [tags, pastas, pastasEspeciais, jobsFinished, staleReset, jobsReconciled, staging] =
      await Promise.all([
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
      resetStaleProcessingItems().catch((e) => {
        console.error("[criacao/fila/sync-pending] staleReset", e);
        return 0;
      }),
      reconcileStuckProcessingJobs().catch((e) => {
        console.error("[criacao/fila/sync-pending] reconcile", e);
        return 0;
      }),
      recoverStagingForPendingItems(60).catch((e) => {
        console.error("[criacao/fila/sync-pending] staging", e);
        return { imported: 0, errors: [String(e)] };
      }),
    ]);
    return NextResponse.json({
      ok: true,
      tags,
      pastas,
      pastasEspeciais,
      jobsFinished,
      staleReset,
      jobsReconciled,
      stagingImported: staging.imported,
      stagingErrors: staging.errors?.slice(0, 5),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/sync-pending POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
