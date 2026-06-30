import { getConfig, setConfig } from "@/lib/config/portalConfigService";
import { normalizePortalEmail } from "@/lib/auth/users";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string | null;
};

function configKeyForUser(email: string): string {
  const norm = normalizePortalEmail(email).replace(/[^a-z0-9]+/g, "_");
  return `criacao.elevenlabs_api_key.${norm}`;
}

export function elevenLabsEnabledGlobally(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export async function resolveElevenLabsApiKey(sessionEmail: string): Promise<string | null> {
  const env = process.env.ELEVENLABS_API_KEY?.trim();
  if (env) return env;
  const userKey = await getConfig(configKeyForUser(sessionEmail));
  return userKey?.trim() || null;
}

export async function saveElevenLabsApiKey(sessionEmail: string, apiKey: string, updatedBy: string): Promise<void> {
  await setConfig(configKeyForUser(sessionEmail), apiKey.trim(), updatedBy);
}

export async function clearElevenLabsApiKey(sessionEmail: string, updatedBy: string): Promise<void> {
  await setConfig(configKeyForUser(sessionEmail), "", updatedBy);
}

export async function listElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`elevenlabs_voices_failed:${res.status}:${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as {
    voices?: ElevenLabsVoice[];
    data?: ElevenLabsVoice[];
  };
  const raw = data.voices ?? data.data ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => ({
      voice_id: String(v.voice_id ?? "").trim(),
      name: String(v.name ?? v.voice_id ?? "").trim(),
      category: v.category,
      preview_url: v.preview_url ?? null,
    }))
    .filter((v) => v.voice_id.length >= 8);
}

export async function synthesizeElevenLabsSpeech(opts: {
  apiKey: string;
  voiceId: string;
  text: string;
  stability?: number;
  speed?: number;
}): Promise<Buffer> {
  const text = opts.text.trim();
  if (!text) throw new Error("texto_obrigatorio");
  const stability = Math.min(1, Math.max(0, opts.stability ?? 0.45));
  const speed = Math.min(1.2, Math.max(0.5, opts.speed ?? 1));
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": opts.apiKey,
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability, similarity_boost: 0.75 },
      speed,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`elevenlabs_tts_failed:${res.status}:${txt.slice(0, 120)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
