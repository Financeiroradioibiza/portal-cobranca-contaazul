/**
 * Desfaz sync da Planilha Rio (CLI).
 * Uso: npm run rio:revert-sync -- 202606
 */
import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { getValidAccessToken } from "../lib/contaazul/session";
import { fetchActiveClientePersonSummaries } from "../lib/contaazul/activeClientesCa";
import { revertRioCompMonthToDonorClone } from "../lib/rio/cloneRioCompMonth";
import {
  purgeRioCaLinhasNotInActiveSet,
  restoreRioCompMonthFromPreSyncSnapshot,
} from "../lib/rio/rioCompSyncSnapshot";

config();

const ym = Number(process.argv[2]);
if (!Number.isFinite(ym) || ym < 200001 || ym > 210012) {
  console.error("Uso: npm run rio:revert-sync -- <yearMonth ex: 202606>");
  process.exit(1);
}

async function main() {
  const month = await prisma.rioCompMonth.findUnique({ where: { yearMonth: ym } });
  if (!month) {
    console.error("month_not_found", ym);
    process.exit(1);
  }
  if (month.closedAt) {
    console.error("month_closed");
    process.exit(1);
  }

  if (month.preSyncSnapshot) {
    const stats = await restoreRioCompMonthFromPreSyncSnapshot(ym);
    console.log("mode=snapshot", stats);
    return;
  }

  try {
    const reset = await revertRioCompMonthToDonorClone(ym);
    console.log("mode=donor_clone", {
      donorYearMonth: reset.donorYearMonth,
      linhas: reset.linhaCount,
    });
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.startsWith("donor_month_not_found")) throw e;
  }

  const token = await getValidAccessToken();
  if (!token) {
    console.error("conta_azul_disconnected");
    process.exit(1);
  }

  const active = await fetchActiveClientePersonSummaries(token);
  const activeIds = new Set(active.map((s) => s.id));
  const { removed } = await purgeRioCaLinhasNotInActiveSet(month.id, activeIds);
  const left = await prisma.rioCompClienteLinha.count({ where: { monthId: month.id } });
  console.log("mode=purge_inactive", {
    removed,
    activeCaCount: active.length,
    linhasRestantes: left,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
