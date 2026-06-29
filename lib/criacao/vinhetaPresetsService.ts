import { prisma } from "@/lib/prisma";
import { getConfig, setConfig } from "@/lib/config/portalConfigService";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import type { ElevenLabsVoice } from "@/lib/criacao/elevenLabsService";

export type VinhetaPresetVoice = { voiceId: string; label: string };
export type VinhetaPresetTrilha = { musicaId: string; label?: string };

export type VinhetaPresetTrilhaRow = {
  id: string;
  titulo: string;
  artista: string;
  previewUrl: string | null;
  label: string;
};

const CONFIG_VOZES = "criacao.vinheta_ia.vozes";
const CONFIG_TRILHAS = "criacao.vinheta_ia.trilhas";

function normalizeVoice(raw: unknown): VinhetaPresetVoice | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const voiceId = String(o.voiceId ?? o.voice_id ?? o.id ?? "").trim();
  const label = String(o.label ?? o.name ?? "").trim();
  if (!voiceId || voiceId.length < 8) return null;
  return { voiceId, label: label || voiceId };
}

function normalizeTrilha(raw: unknown): VinhetaPresetTrilha | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const musicaId = String(o.musicaId ?? o.id ?? "").trim();
  if (!musicaId) return null;
  const label = String(o.label ?? "").trim();
  return label ? { musicaId, label } : { musicaId };
}

function parseJsonArray<T>(raw: string, normalize: (v: unknown) => T | null): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((x): x is T => x !== null);
  } catch {
    return [];
  }
}

function parseVozesEnv(raw: string): VinhetaPresetVoice[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return parseJsonArray(trimmed, normalizeVoice);
  return trimmed
    .split(",")
    .map((part) => {
      const [id, ...rest] = part.split(":");
      const voiceId = (id ?? "").trim();
      const label = rest.join(":").trim();
      if (!voiceId) return null;
      return { voiceId, label: label || voiceId };
    })
    .filter((x): x is VinhetaPresetVoice => x !== null);
}

function parseTrilhasEnv(raw: string): VinhetaPresetTrilha[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return parseJsonArray(trimmed, normalizeTrilha);
  return trimmed
    .split(",")
    .map((part) => {
      const [id, ...rest] = part.split(":");
      const musicaId = (id ?? "").trim();
      const label = rest.join(":").trim();
      if (!musicaId) return null;
      return label ? { musicaId, label } : { musicaId };
    })
    .filter((x): x is VinhetaPresetTrilha => x !== null);
}

async function readStoredVozes(): Promise<VinhetaPresetVoice[]> {
  const db = await getConfig(CONFIG_VOZES);
  if (db?.trim()) return parseJsonArray(db, normalizeVoice);
  const env = process.env.VINHETA_IA_VOZES?.trim();
  return env ? parseVozesEnv(env) : [];
}

async function readStoredTrilhas(): Promise<VinhetaPresetTrilha[]> {
  const db = await getConfig(CONFIG_TRILHAS);
  if (db?.trim()) return parseJsonArray(db, normalizeTrilha);
  const env = process.env.VINHETA_IA_TRILHAS?.trim();
  return env ? parseTrilhasEnv(env) : [];
}

export async function getPresetVoices(): Promise<VinhetaPresetVoice[]> {
  return readStoredVozes();
}

export async function getPresetTrilhas(): Promise<VinhetaPresetTrilha[]> {
  return readStoredTrilhas();
}

export function presetVoicesToElevenLabs(vozes: VinhetaPresetVoice[]): ElevenLabsVoice[] {
  return vozes.map((v) => ({
    voice_id: v.voiceId,
    name: v.label,
    category: "preset",
  }));
}

export async function enrichPresetTrilhas(trilhas: VinhetaPresetTrilha[]): Promise<VinhetaPresetTrilhaRow[]> {
  if (trilhas.length === 0) return [];
  const ids = trilhas.map((t) => t.musicaId);
  const musicas = await prisma.musicaBiblioteca.findMany({
    where: { id: { in: ids }, status: "pronta" },
    select: {
      id: true,
      titulo: true,
      artista: true,
      versoes: { select: { formato: true } },
    },
  });
  const byId = new Map(musicas.map((m) => [m.id, m]));
  const rows: VinhetaPresetTrilhaRow[] = [];
  for (const t of trilhas) {
    const m = byId.get(t.musicaId);
    if (!m) continue;
    const fmt = pickLowestPreviewFormato(m.versoes);
    rows.push({
      id: m.id,
      titulo: m.titulo,
      artista: m.artista,
      previewUrl: fmt ? buildPreviewUrl(m.id, fmt) : null,
      label: t.label?.trim() || `${m.artista} — ${m.titulo}`,
    });
  }
  return rows;
}

export async function saveVinhetaPresets(opts: {
  voices: VinhetaPresetVoice[];
  trilhas: VinhetaPresetTrilha[];
  updatedBy: string;
}): Promise<void> {
  const voices = opts.voices
    .map((v) => ({ voiceId: v.voiceId.trim(), label: v.label.trim() || v.voiceId.trim() }))
    .filter((v) => v.voiceId.length >= 8);
  const trilhas = opts.trilhas
    .map((t) => ({
      musicaId: t.musicaId.trim(),
      ...(t.label?.trim() ? { label: t.label.trim() } : {}),
    }))
    .filter((t) => t.musicaId.length > 0);

  await setConfig(CONFIG_VOZES, JSON.stringify(voices), opts.updatedBy);
  await setConfig(CONFIG_TRILHAS, JSON.stringify(trilhas), opts.updatedBy);
}

export async function getVinhetaCatalogPayload() {
  const [presetVoices, presetTrilhasRaw] = await Promise.all([getPresetVoices(), getPresetTrilhas()]);
  const presetTrilhas = await enrichPresetTrilhas(presetTrilhasRaw);
  return {
    presetVoices,
    presetTrilhas,
    presetVoicesAsElevenLabs: presetVoicesToElevenLabs(presetVoices),
  };
}
