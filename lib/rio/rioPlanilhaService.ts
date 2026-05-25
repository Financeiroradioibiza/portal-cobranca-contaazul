import {
  PrismaClient,
  RioChargeMode,
  RioPlanilhaBand,
  RioPlanilhaRowKind,
  type RioPlanilhaRow,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const START_YEAR_MONTH_DEFAULT = 202605; /** Maio 2026 */

/** Lista meses (mais recente primeiro). */
export async function listRioMonths(
  client: Pick<PrismaClient, "rioPlanilhaMonth">,
): Promise<Array<{ id: string; yearMonth: number }>> {
  return client.rioPlanilhaMonth.findMany({
    select: { id: true, yearMonth: true },
    orderBy: { yearMonth: "desc" },
  });
}

const DEFAULT_SECOES: Array<{ band: RioPlanilhaBand; titulo: string; sortOrder: number }> = [
  { band: "canceladas", titulo: "LOJAS CANCELANDO OU CANCELADAS", sortOrder: 0 },
  { band: "novos", titulo: "PDVS NOVOS DO MÊS", sortOrder: 1 },
  { band: "ativos", titulo: "CLIENTES ATIVOS", sortOrder: 2 },
];

export async function ensureRioMonth(
  client: PrismaClient,
  yearMonth: number,
): Promise<{ id: string; yearMonth: number; linhas: RioPlanilhaRow[] }> {
  let month = await client.rioPlanilhaMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });

  if (!month) {
    await client.$transaction(async (tx) => {
      const m = await tx.rioPlanilhaMonth.create({ data: { yearMonth } });
      await tx.rioPlanilhaRow.createMany({
        data: DEFAULT_SECOES.map((s) => ({
          monthId: m.id,
          band: s.band,
          kind: RioPlanilhaRowKind.secao,
          tituloSecao: s.titulo,
          sortOrder: s.sortOrder,
        })),
      });
    });
    month = await client.rioPlanilhaMonth.findUniqueOrThrow({
      where: { yearMonth },
      include: {
        linhas: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    });
  }

  return month;
}

export function defaultFirstRioYearMonth(): number {
  const fromEnv = Number(process.env.RIO_PLANILHA_START_YM ?? "");
  if (
    typeof fromEnv === "number" &&
    !Number.isNaN(fromEnv) &&
    fromEnv >= 200001 &&
    fromEnv <= 210012
  ) {
    return fromEnv;
  }
  return START_YEAR_MONTH_DEFAULT;
}

/** Garante existência do mês inicial (Maio/2026) no primeiro acesso ao painel. */
export async function ensureInitialRioMonthIfEmpty(): Promise<void> {
  const n = await prisma.rioPlanilhaMonth.count();
  if (n > 0) return;
  await ensureRioMonth(prisma, defaultFirstRioYearMonth());
}

function trimOrNull(s: string | undefined | null, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function trimReq(s: string | undefined | null, max: number): string {
  const t = typeof s === "string" ? s.trim() : "";
  return t.slice(0, max);
}

export type RioRowSaveInput = {
  clientKey: string;
  parentClientKey?: string | null;
  band: RioPlanilhaBand;
  kind: RioPlanilhaRowKind;
  tituloSecao?: string | null;
  marca?: string;
  numOrdem?: number | null;
  pdvNome?: string;
  cnpjDocumento?: string | null;
  status?: string;
  valorTexto?: string | null;
  qtdeTexto?: string | null;
  categoria?: string;
  email?: string | null;
  dataInstall?: string | null;
  grupoCobranca?: string;
  razao?: string;
  dataCancel?: string | null;
  notes?: string;
  contaAzulPersonId?: string | null;
  chargeMode?: RioChargeMode;
  sortOrder: number;
};

/** Pai sempre antes dos filhos (dentro do mesmo PUT). */
export function topoOrderRioRows(rows: RioRowSaveInput[]): RioRowSaveInput[] {
  const byKey = new Map(rows.map((r) => [r.clientKey, r]));
  const visited = new Set<string>();
  const out: RioRowSaveInput[] = [];

  function visit(k: string) {
    const r = byKey.get(k);
    if (!r || visited.has(k)) return;
    const pk = r.parentClientKey?.trim();
    if (pk && byKey.has(pk)) visit(pk);
    visited.add(k);
    out.push(r);
  }

  for (const r of rows) visit(r.clientKey);
  return out;
}

export async function replaceRioMonthRows(
  client: PrismaClient,
  yearMonth: number,
  rowsIn: RioRowSaveInput[],
): Promise<RioPlanilhaRow[]> {
  const keys = new Set(rowsIn.map((r) => r.clientKey));
  for (const r of rowsIn) {
    const pk = r.parentClientKey?.trim() || null;
    if (pk && !keys.has(pk)) {
      throw new Error("referencia_parent_invalida");
    }
    if ((r.kind === "grupo" || r.kind === "secao") && pk) {
      throw new Error("secao_grupo_sem_parent");
    }
    if (r.kind === "pdv" && pk) {
      const p = rowsIn.find((x) => x.clientKey === pk);
      if (!p || p.kind !== "grupo") {
        throw new Error("pdv_sob_grupo_requer_parent_grupo");
      }
    }
  }

  const month = await client.rioPlanilhaMonth.findUnique({ where: { yearMonth } });
  if (!month) throw new Error("month_not_found");

  const sorted = topoOrderRioRows(rowsIn);
  await client.$transaction(async (tx) => {
    await tx.rioPlanilhaRow.deleteMany({ where: { monthId: month.id } });

    const idMap = new Map<string, string>();
    for (const r of sorted) {
      const pk = r.parentClientKey?.trim() || null;
      const parentId = pk ? idMap.get(pk) ?? null : null;
      if (pk && parentId == null) {
        throw new Error("ordenacao_parent_perdido");
      }

      const created = await tx.rioPlanilhaRow.create({
        data: {
          monthId: month.id,
          band: r.band,
          kind: r.kind,
          parentId,
          tituloSecao:
            r.kind === "secao"
              ? (trimReq(r.tituloSecao ?? "", 800) || "(sem título)")
              : null,
          marca: trimReq(r.marca, 240),
          numOrdem:
            typeof r.numOrdem === "number" && Number.isFinite(r.numOrdem) ? Math.floor(r.numOrdem) : null,
          pdvNome: trimReq(r.pdvNome, 500),
          cnpjDocumento: trimOrNull(r.cnpjDocumento, 42),
          status: trimReq(r.status, 240),
          valorTexto: trimOrNull(r.valorTexto, 120),
          qtdeTexto: trimOrNull(r.qtdeTexto, 120),
          categoria: trimReq(r.categoria, 200),
          email: trimOrNull(r.email, 900),
          dataInstall: trimOrNull(r.dataInstall, 80),
          grupoCobranca: trimReq(r.grupoCobranca, 2000),
          razao: trimReq(r.razao, 2000),
          dataCancel: trimOrNull(r.dataCancel, 80),
          notes: trimReq(r.notes, 20000),
          contaAzulPersonId: trimOrNull(r.contaAzulPersonId, 140),
          chargeMode: r.kind === "pdv" ? r.chargeMode ?? RioChargeMode.herda_grupo : RioChargeMode.herda_grupo,
          sortOrder: Math.floor(r.sortOrder) || 0,
        },
      });

      idMap.set(r.clientKey, created.id);
    }
  });

  return client.rioPlanilhaRow.findMany({
    where: { monthId: month.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}
