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
