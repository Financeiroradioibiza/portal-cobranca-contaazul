/**
 * Uso: DOWNLOAD_JOB_ID=cms... npm run criacao:recover-staging-servidor-up
 * Reimporta MP3 Deemix → cloud2 para jobs Servidor UP (pareamento ~N corrigido).
 */
import { prisma } from "../lib/prisma";
import { recoverServidorUpStagingForDownloadJob } from "../lib/criacao/servidorUpRecoverStagingService";

const DOWNLOAD_JOB_ID = (process.env.DOWNLOAD_JOB_ID ?? "").trim() || "cms6ozo7b001e1xbi1a515ec2";
const MAX_ROUNDS = Math.min(50, Math.max(1, Number(process.env.MAX_ROUNDS ?? "20") || 20));
const MAX_ITEMS = Math.min(500, Math.max(1, Number(process.env.MAX_ITEMS ?? "400") || 400));

async function pendingCount(): Promise<number> {
  return prisma.processamentoItem.count({
    where: {
      status: "aguardando",
      rawStorageKey: null,
      job: { status: { in: ["aguardando", "processando"] } },
    },
  });
}

async function main() {
  console.log(`Recover staging · downloadJobId=${DOWNLOAD_JOB_ID}`);
  let totalImported = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const before = await pendingCount();
    if (before === 0) {
      console.log("Nenhum item pendente sem MP3 no cloud2.");
      break;
    }
    console.log(`\nRodada ${round}/${MAX_ROUNDS} · pendentes=${before}`);
    const r = await recoverServidorUpStagingForDownloadJob(DOWNLOAD_JOB_ID, { maxItems: MAX_ITEMS });
    console.log(
      `  pairs=${r.pairsAttempted} imported=${r.imported}`,
      r.errors.slice(0, 3).join(" · ") || "ok",
    );
    totalImported += r.imported;
    if (r.imported === 0) break;
  }
  const after = await pendingCount();
  console.log(`\nTotal importado=${totalImported} · pendentes restantes=${after}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
