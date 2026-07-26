/** Badges temporários na biblioteca — destino de cada versão (B2 vs disco). */

export type MusicaStorageBadgeId = "b2-192" | "b2-128" | "b2-64";

export type MusicaStorageBadge = {
  id: MusicaStorageBadgeId;
  label: string;
  title: string;
};

export function masterOnB2(masterStorageKey: string | null | undefined): boolean {
  const k = masterStorageKey?.trim() ?? "";
  if (!k || k.startsWith("local:")) return false;
  if (k.startsWith("b2:")) return true;
  if (k.includes("/") && k.endsWith(".mp3")) return true;
  return false;
}

export function versaoOnB2(storageKey: string | null | undefined): boolean {
  return Boolean(storageKey?.trim().startsWith("b2:"));
}

export function deriveMusicaStorageBadges(input: {
  masterStorageKey: string | null | undefined;
  versoes: ReadonlyArray<{ formato: string; storageKey?: string | null }>;
}): MusicaStorageBadge[] {
  const out: MusicaStorageBadge[] = [];

  if (masterOnB2(input.masterStorageKey)) {
    out.push({
      id: "b2-192",
      label: "b2-192",
      title: "Master 192 kbps no Backblaze B2",
    });
  }

  const v128 = input.versoes.find((v) => v.formato === "mp3_128_mono");
  if (v128 && versaoOnB2(v128.storageKey)) {
    out.push({
      id: "b2-128",
      label: "b2-128",
      title: "128 mono (uso / player) no Backblaze B2",
    });
  }

  const v64 = input.versoes.find((v) => v.formato.startsWith("mp3_64"));
  if (v64 && versaoOnB2(v64.storageKey)) {
    out.push({
      id: "b2-64",
      label: "b2-64",
      title: "64 kbps (preview portal) no Backblaze B2",
    });
  }

  return out;
}
