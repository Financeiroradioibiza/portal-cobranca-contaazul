#!/usr/bin/env npx tsx
/**
 * Atualiza só contratos (e valor do contrato) na Planilha Rio — clientes vinculados
 * à CA com `contratos_ativos_texto` vazio na competência vigente.
 *
 *   npx tsx scripts/refresh-rio-contratos-faltantes.ts
 *   npx tsx scripts/refresh-rio-contratos-faltantes.ts --dry-run
 *   npx tsx scripts/refresh-rio-contratos-faltantes.ts --limit=20
 */
import { getValidAccessToken } from "../lib/contaazul/session";
import { pickVigenteRioYearMonth } from "../lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "../lib/manualReminders/yearMonth";
import { prisma } from "../lib/prisma";
import {
  applyCaPersonToRioLinha,
  isRioCaPersonLinked,
} from "../lib/rio/rioCaPersonLink";

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 0) : undefined;

async function main() {
  const token = await getValidAccessToken();
  if (!token) {
    console.error("Conta Azul não conectada — reconecte no painel principal (/).");
    process.exit(1);
  }

  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { id: true, yearMonth: true, closedAt: true },
  });
  const open = months.filter((m) => !m.closedAt);
  const vigenteYm = pickVigenteRioYearMonth(open, currentBrazilYearMonth());
  const month = open.find((m) => m.yearMonth === vigenteYm) ?? open[0];
  if (!month) {
    console.error("Nenhuma competência Rio aberta.");
    process.exit(1);
  }

  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: {
      monthId: month.id,
      movimento: { not: "saida" },
      contratosAtivosTexto: "",
    },
    select: { id: true, nomeFantasia: true, caPersonId: true },
    orderBy: [{ nomeFantasia: "asc" }, { id: "asc" }],
  });

  const pending = linhas.filter((l) => isRioCaPersonLinked(l.caPersonId));
  const slice = limit ? pending.slice(0, limit) : pending;

  console.log(`Competência ${month.yearMonth}: ${slice.length} cliente(s) sem contrato (${pending.length} no total).`);
  if (dryRun) {
    for (const l of slice) console.log(`  - ${l.nomeFantasia}`);
    return;
  }

  let ok = 0;
  let stillEmpty = 0;
  let failed = 0;

  for (const l of slice) {
    try {
      const out = await applyCaPersonToRioLinha(l.id, month.id, l.caPersonId, token, {
        includePersonDetails: false,
        includeContracts: true,
      });
      const nums = out.contratosAtivosTexto?.trim() ?? "";
      if (nums) {
        ok += 1;
        console.log(`✓ ${l.nomeFantasia.slice(0, 60)} → ${nums.slice(0, 80)}`);
      } else {
        stillEmpty += 1;
        console.log(`○ ${l.nomeFantasia.slice(0, 60)} → (sem contrato ATIVO na CA)`);
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✗ ${l.nomeFantasia.slice(0, 60)} — ${msg.slice(0, 120)}`);
    }
  }

  console.log("");
  console.log(`Concluído: ${ok} com contrato, ${stillEmpty} ainda vazio (CA), ${failed} falha.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
