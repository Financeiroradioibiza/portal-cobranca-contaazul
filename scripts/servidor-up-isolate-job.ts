/** Desliga auto-fila em snapshots Servidor UP antigos; mantém só o job alvo. */
import { prisma } from "../lib/prisma";
import { getServidorUpUploadSnapshot, saveServidorUpUploadSnapshot } from "../lib/criacao/servidorUpUploadSnapshotService";
import type { ServidorUpUploadSession } from "../lib/criacao/servidorUpUploadSession";

const KEEP = (process.argv[2] ?? "cmsdve8ho000080d41l1pbvzd").trim();
const DRY = process.argv.includes("--dry-run");

async function main() {
  const rows = await prisma.servidorUpUploadSnapshot.findMany();
  let disabled = 0;
  for (const row of rows) {
    if (row.downloadJobId === KEEP) continue;
    const snap = await getServidorUpUploadSnapshot(row.downloadJobId);
    if (!snap) continue;
    if (snap.autoEnqueueFila === false) continue;
    console.log("OFF", row.downloadJobId.slice(0, 12), snap.titulo ?? snap.rootPath, "tracks", snap.tracks?.length);
    disabled += 1;
    if (!DRY) {
      await saveServidorUpUploadSnapshot(row.downloadJobId, {
        ...snap,
        autoEnqueueFila: false,
        savedAt: Date.now(),
      } as ServidorUpUploadSession);
    }
  }
  const keep = await getServidorUpUploadSnapshot(KEEP);
  console.log("\nMANTÉM", KEEP, keep?.titulo, "tracks", keep?.tracks?.length, "auto", keep?.autoEnqueueFila !== false);
  console.log(DRY ? `Dry-run: ${disabled} snapshot(s) seriam desligados.` : `Desligados: ${disabled}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
