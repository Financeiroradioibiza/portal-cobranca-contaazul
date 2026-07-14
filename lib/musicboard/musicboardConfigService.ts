import { prisma } from "@/lib/prisma";

export type MusicboardPeriodo = "3m" | "6m";

export type MusicboardClienteConfigRow = {
  portalClienteId: number;
  enabled: boolean;
  emails: string[];
  periodo: MusicboardPeriodo;
  depoimentoTexto: string;
  depoimentoAutor: string;
  narrativaCurador: string;
  ultimoEnvioEm: string | null;
  atualizadoPor: string;
  updatedAt: string;
};

function parseEmailsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function parsePeriodo(raw: string): MusicboardPeriodo {
  return raw === "3m" ? "3m" : "6m";
}

function rowToDto(row: {
  portalClienteId: number;
  enabled: boolean;
  emailsJson: unknown;
  periodo: string;
  depoimentoTexto: string;
  depoimentoAutor: string;
  narrativaCurador: string;
  ultimoEnvioEm: Date | null;
  atualizadoPor: string;
  updatedAt: Date;
}): MusicboardClienteConfigRow {
  return {
    portalClienteId: row.portalClienteId,
    enabled: row.enabled,
    emails: parseEmailsJson(row.emailsJson),
    periodo: parsePeriodo(row.periodo),
    depoimentoTexto: row.depoimentoTexto,
    depoimentoAutor: row.depoimentoAutor,
    narrativaCurador: row.narrativaCurador,
    ultimoEnvioEm: row.ultimoEnvioEm?.toISOString() ?? null,
    atualizadoPor: row.atualizadoPor,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMusicboardConfigs(): Promise<MusicboardClienteConfigRow[]> {
  const rows = await prisma.musicboardClienteConfig.findMany({
    orderBy: [{ portalClienteId: "asc" }],
  });
  return rows.map(rowToDto);
}

export async function getMusicboardConfig(
  portalClienteId: number,
): Promise<MusicboardClienteConfigRow | null> {
  const row = await prisma.musicboardClienteConfig.findUnique({
    where: { portalClienteId },
  });
  return row ? rowToDto(row) : null;
}

export async function upsertMusicboardConfig(input: {
  portalClienteId: number;
  enabled?: boolean;
  emails?: string[];
  periodo?: MusicboardPeriodo;
  depoimentoTexto?: string;
  depoimentoAutor?: string;
  narrativaCurador?: string;
  atualizadoPor: string;
}): Promise<MusicboardClienteConfigRow> {
  const emails = input.emails != null ? parseEmailsJson(input.emails) : undefined;
  const row = await prisma.musicboardClienteConfig.upsert({
    where: { portalClienteId: input.portalClienteId },
    create: {
      portalClienteId: input.portalClienteId,
      enabled: input.enabled ?? false,
      emailsJson: emails ?? [],
      periodo: input.periodo ?? "6m",
      depoimentoTexto: input.depoimentoTexto ?? "",
      depoimentoAutor: input.depoimentoAutor ?? "",
      narrativaCurador: input.narrativaCurador ?? "",
      atualizadoPor: input.atualizadoPor.slice(0, 120),
    },
    update: {
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(emails != null ? { emailsJson: emails } : {}),
      ...(input.periodo != null ? { periodo: input.periodo } : {}),
      ...(input.depoimentoTexto != null ? { depoimentoTexto: input.depoimentoTexto } : {}),
      ...(input.depoimentoAutor != null ? { depoimentoAutor: input.depoimentoAutor.slice(0, 200) } : {}),
      ...(input.narrativaCurador != null ? { narrativaCurador: input.narrativaCurador } : {}),
      atualizadoPor: input.atualizadoPor.slice(0, 120),
    },
  });
  return rowToDto(row);
}

export async function markMusicboardEnviado(
  portalClienteId: number,
  atualizadoPor: string,
): Promise<void> {
  await prisma.musicboardClienteConfig.update({
    where: { portalClienteId },
    data: {
      ultimoEnvioEm: new Date(),
      atualizadoPor: atualizadoPor.slice(0, 120),
    },
  });
}
