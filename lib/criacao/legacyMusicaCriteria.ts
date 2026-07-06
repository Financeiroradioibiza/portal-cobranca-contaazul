import { Prisma } from "@prisma/client";

/** Faixa legada = upload anterior ao pipeline atual (128 mono + LUFS + master). */
export const LEGACY_MUSICA_SQL = Prisma.sql`(
  m.loudness_lufs IS NULL
  OR m.master_storage_key IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM musica_versao v
     WHERE v.musica_id = m.id AND v.formato::text = 'mp3_128_mono'
  )
)`;

export type LegacyMotivo = "sem_lufs" | "sem_master" | "sem_128_mono";

export const LEGACY_MOTIVO_LABEL: Record<LegacyMotivo, string> = {
  sem_lufs: "sem LUFS",
  sem_master: "sem master",
  sem_128_mono: "sem 128 mono",
};

export function computeLegacyMotivos(m: {
  loudnessLufs: number | null;
  masterStorageKey: string | null;
  versoes: Array<{ formato: string }>;
}): LegacyMotivo[] {
  const motivos: LegacyMotivo[] = [];
  if (m.loudnessLufs == null) motivos.push("sem_lufs");
  if (!m.masterStorageKey) motivos.push("sem_master");
  if (!m.versoes.some((v) => v.formato === "mp3_128_mono")) motivos.push("sem_128_mono");
  return motivos;
}

export function isLegacyMusica(m: {
  loudnessLufs: number | null;
  masterStorageKey: string | null;
  versoes: Array<{ formato: string }>;
}): boolean {
  return computeLegacyMotivos(m).length > 0;
}
