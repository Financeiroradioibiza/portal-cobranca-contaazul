/** Logs estruturados por etapa do pipeline (Fase B — observabilidade). */

export type PipelineLogCtx = {
  itemId: string;
  jobId?: string;
  musicaId?: string;
  etapa: string;
};

export function pipelineLog(ctx: PipelineLogCtx, msg: string, extra?: Record<string, unknown>): void {
  const base = {
    ts: new Date().toISOString(),
    component: 'criacao-pipeline',
    itemId: ctx.itemId,
    jobId: ctx.jobId,
    musicaId: ctx.musicaId,
    etapa: ctx.etapa,
    msg,
    ...extra,
  };
  console.log(JSON.stringify(base));
}

export async function pipelineTimed<T>(
  ctx: PipelineLogCtx,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  pipelineLog(ctx, 'inicio');
  try {
    const result = await fn();
    pipelineLog(ctx, 'ok', { ms: Date.now() - t0 });
    return result;
  } catch (e) {
    pipelineLog(ctx, 'erro', {
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
