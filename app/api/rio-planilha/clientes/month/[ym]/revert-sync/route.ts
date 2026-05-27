import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { fetchActiveClientePersonSummaries } from "@/lib/contaazul/activeClientesCa";
import { formatYearMonthLabel, parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";
import { prisma } from "@/lib/prisma";
import { revertRioCompMonthToDonorClone } from "@/lib/rio/cloneRioCompMonth";
import {
  purgeRioCaLinhasNotInActiveSet,
  restoreRioCompMonthFromPreSyncSnapshot,
} from "@/lib/rio/rioCompSyncSnapshot";
import { isRioTurnoverMonth } from "@/lib/rio/rioTurnover";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ ym: string }> };

/**
 * POST — desfaz o último «Sincronizar Conta Azul»:
 * 1) se existir `pre_sync_snapshot`, restaura o mês inteiro;
 * 2) senão repõe a partir do mês anterior na base (ex.: maio ← abril);
 * 3) senão remove só clientes inativos na CA.
 */
export async function POST(_req: Request, context: Ctx) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "conta_azul_disconnected" }, { status: 401 });
  }

  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  const month = await prisma.rioCompMonth.findUnique({ where: { yearMonth: ym } });
  if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });
  if (month.closedAt) return NextResponse.json({ error: "month_closed" }, { status: 403 });

  try {
    if (month.preSyncSnapshot) {
      const stats = await restoreRioCompMonthFromPreSyncSnapshot(ym);
      const full = await getRioCompMonthWithLinhas(ym);
      return NextResponse.json({
        ok: true,
        mode: "snapshot" as const,
        restoredAt: stats.restoredAt,
        grupos: full?.grupos ?? [],
        linhas: full?.linhas ?? [],
        message: `Competência restaurada ao estado antes do último sync (${stats.linhas} clientes).`,
      });
    }

    try {
      const reset = await revertRioCompMonthToDonorClone(ym);
      const virada = isRioTurnoverMonth(ym);
      return NextResponse.json({
        ok: true,
        mode: "donor_clone" as const,
        donorYearMonth: reset.donorYearMonth,
        grupos: reset.grupos,
        linhas: reset.linhas,
        message:
          virada ?
            `Virada desfeita: ${reset.linhaCount} linhas repostas a partir de ${formatYearMonthLabel(reset.donorYearMonth)}. Pode usar «Virada do mês» de novo (só ativos).`
          : `Sync desfeito: ${reset.linhaCount} linhas repostas a partir de ${formatYearMonthLabel(reset.donorYearMonth)}. O sync antigo em maio apagava tudo — isto repõe a cópia do mês anterior na base.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.startsWith("donor_month_not_found")) throw e;
    }

    const active = await fetchActiveClientePersonSummaries(token);
    const activeIds = new Set(active.map((s) => s.id));
    const { removed } = await purgeRioCaLinhasNotInActiveSet(month.id, activeIds);
    const full = await getRioCompMonthWithLinhas(ym);
    return NextResponse.json({
      ok: true,
      mode: "purge_inactive" as const,
      removed,
      activeCaCount: active.length,
      grupos: full?.grupos ?? [],
      linhas: full?.linhas ?? [],
      message:
        removed > 0 ?
          `Removidas ${removed} linhas de clientes inativos na Conta Azul. Não havia backup do sync anterior — clientes manuais apagados no sync não voltam automaticamente.`
        : "Nenhuma linha inativa encontrada para remover.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "revert_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
