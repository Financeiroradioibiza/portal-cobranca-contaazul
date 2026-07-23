import { prisma } from "@/lib/prisma";

export type FilaCounts = {
  aguardando: number;
  processando: number;
  concluidoTotal: number;
};

export type DayCount = { day: string; count: number };

export type SystemStatsView = {
  cpuCount: number;
  load1: number;
  load5: number;
  load15: number;
  loadPercent: number;
};

const HISTORY_DAYS = 30;
const SNAPSHOT_MIN_INTERVAL_MS = 55 * 60 * 1000;

export async function fetchCriacaoFilaCounts(): Promise<FilaCounts> {
  const rows = await prisma.$queryRaw<
    { status: string; n: number }[]
  >`SELECT status::text AS status, count(*)::int AS n FROM processamento_item GROUP BY status`;

  let aguardando = 0;
  let processando = 0;
  let concluidoTotal = 0;
  for (const r of rows) {
    if (r.status === "aguardando") aguardando = r.n;
    else if (r.status === "processando") processando = r.n;
    else if (r.status === "concluido") concluidoTotal = r.n;
  }

  const withFile = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM processamento_item
     WHERE status = 'aguardando' AND raw_storage_key IS NOT NULL
  `;
  return {
    aguardando: withFile[0]?.n ?? aguardando,
    processando,
    concluidoTotal,
  };
}

/** Faixas concluídas por dia (fuso São Paulo) — últimos N dias. */
export async function fetchFaixasConcluidasPorDia(days = HISTORY_DAYS): Promise<DayCount[]> {
  const rows = await prisma.$queryRaw<{ day: Date; count: number }[]>`
    SELECT (updated_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           count(*)::int AS count
      FROM processamento_item
     WHERE status = 'concluido'
       AND updated_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - (${days}::int - 1)
     GROUP BY 1
     ORDER BY 1 ASC
  `;

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    byDay.set(key, r.count);
  }

  const out: DayCount[] = [];
  const end = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function fetchDiskHistoryByDay(days = HISTORY_DAYS): Promise<{ day: string; usedPercent: number }[]> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.servidorCloud2Snapshot.findMany({
      where: { collectedAt: { gte: since } },
      orderBy: { collectedAt: "asc" },
      select: { collectedAt: true, diskUsedPercent: true },
    });
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const key = r.collectedAt.toISOString().slice(0, 10);
      byDay.set(key, r.diskUsedPercent);
    }
    const out: { day: string; usedPercent: number }[] = [];
    const end = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const v = byDay.get(key);
      if (v != null) out.push({ day: key, usedPercent: v });
    }
    return out;
  } catch {
    return [];
  }
}

export async function maybeRecordServidorSnapshot(input: {
  disk: { usedPercent: number; freeBytes: number } | null;
  system: SystemStatsView | null;
  fila: FilaCounts;
}): Promise<void> {
  if (!input.disk) return;
  try {
    const last = await prisma.servidorCloud2Snapshot.findFirst({
      orderBy: { collectedAt: "desc" },
      select: { collectedAt: true },
    });
    if (last && Date.now() - last.collectedAt.getTime() < SNAPSHOT_MIN_INTERVAL_MS) {
      return;
    }
    await prisma.servidorCloud2Snapshot.create({
      data: {
        diskUsedPercent: input.disk.usedPercent,
        diskFreeBytes: BigInt(Math.max(0, input.disk.freeBytes)),
        load1: input.system?.load1 ?? null,
        cpuCount: input.system?.cpuCount ?? null,
        filaAguardando: input.fila.aguardando,
        filaProcessando: input.fila.processando,
      },
    });
    const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    await prisma.servidorCloud2Snapshot.deleteMany({ where: { collectedAt: { lt: cutoff } } });
  } catch (e) {
    console.warn("[servidorMetrics] snapshot skip:", e instanceof Error ? e.message : e);
  }
}

export function buildCapacityHint(opts: {
  diskUsedPercent: number | null;
  loadPercent: number | null;
  filaProcessando: number;
  filaAguardando: number;
}): { level: "ok" | "warn" | "critical"; message: string } {
  const disk = opts.diskUsedPercent ?? 0;
  const load = opts.loadPercent ?? 0;
  if (disk >= 92 || load >= 95) {
    return {
      level: "critical",
      message:
        disk >= 92 && load >= 85 ?
          "Disco e CPU/load altos — risco de falha no pipeline."
        : disk >= 92 ?
          "Disco NVMe acima de 92% — libere espaço ou expanda volume."
        : "Load da VM muito alto — fila pode ficar lenta (ffmpeg).",
    };
  }
  if (disk >= 80 || load >= 75 || (opts.filaAguardando > 20 && opts.filaProcessando > 0)) {
    return {
      level: "warn",
      message:
        opts.filaAguardando > 0 && opts.filaProcessando > 0 ?
          `Backlog: ${opts.filaAguardando} aguardando · ${opts.filaProcessando} processando — worker serial (~1 faixa por vez).`
        : load >= 75 ?
          `CPU/load ~${load.toFixed(0)}% (load ÷ núcleos) — perto do limite em picos.`
        : `Disco em ${disk.toFixed(0)}% — acompanhe crescimento.`,
    };
  }
  return {
    level: "ok",
    message:
      opts.filaProcessando > 0 ?
        `${opts.filaProcessando} faixa(s) processando agora.`
      : opts.filaAguardando > 0 ?
        `${opts.filaAguardando} na fila; worker ocioso entre lotes.`
      : "Fila ociosa — capacidade disponível.",
  };
}
