import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";

export type SeedTemplateRow = {
  emissionDay: number;
  clienteNome: string;
  cnpjDocumento?: string | null;
  tarefaNotaSpreadsheet?: string | null;
  solicitarPedirOc: boolean;
  anexarListagemClientesOc?: boolean;
};

/**
 * Lê `data/manual-reminder-template.seed.json` e faz upsert em `ManualReminderTemplate`
 * (chave: `clienteNome` exatamente como na planilha).
 * Só executa quando a tabela mestre está vazia — evita sobrescrever edições suas no banco a cada novo mês.
 */
export async function ensureTemplatesFromSeed(prisma: PrismaClient): Promise<{ count: number }> {
  const existingCount = await prisma.manualReminderTemplate.count();
  if (existingCount > 0) return { count: existingCount };

  const path = join(process.cwd(), "data", "manual-reminder-template.seed.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as SeedTemplateRow[];
  await prisma.manualReminderTemplate.createMany({
    data: parsed.map((r, ix) => {
      const hint = r.tarefaNotaSpreadsheet?.trim() || null;
      return {
        emissionDay: Number(r.emissionDay) || 1,
        clienteNome: r.clienteNome.trim(),
        cnpjDocumento: r.cnpjDocumento?.trim() || null,
        solicitarPedirOc: Boolean(r.solicitarPedirOc),
        anexarListagemClientesOc: Boolean(r.anexarListagemClientesOc),
        spreadsheetHint: hint,
        sortOrder: ix,
      };
    }),
  });
  return { count: parsed.length };
}

/**
 * Opcional: força nova importação a partir da planilha JSON (somente onde `clienteNome` bater).
 */
export async function mergeTemplatesFromSeedFile(prisma: PrismaClient): Promise<{ merged: number }> {
  const path = join(process.cwd(), "data", "manual-reminder-template.seed.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as SeedTemplateRow[];
  let order = 0;
  for (const r of parsed) {
    const hint = r.tarefaNotaSpreadsheet?.trim() || null;
    const existing = await prisma.manualReminderTemplate.findFirst({
      where: { clienteNome: r.clienteNome.trim() },
    });
    const data = {
      emissionDay: Number(r.emissionDay) || 1,
      clienteNome: r.clienteNome.trim(),
      cnpjDocumento: r.cnpjDocumento?.trim() || null,
      solicitarPedirOc: Boolean(r.solicitarPedirOc),
      anexarListagemClientesOc: Boolean(r.anexarListagemClientesOc),
      spreadsheetHint: hint,
      sortOrder: order++,
    };
    if (existing) {
      await prisma.manualReminderTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.manualReminderTemplate.create({ data });
    }
  }
  return { merged: parsed.length };
}
