import { prisma } from "@/lib/prisma";
import { buildVinhetaPreviewUrl, buildVinhetaTrilhaPreviewUrl } from "@/lib/criacao/vinhetaSign";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import {
  listElevenLabsVoices,
  resolveElevenLabsApiKey,
  synthesizeElevenLabsSpeech,
} from "@/lib/criacao/elevenLabsService";
import { VINHETA_CLONE_URL, VINHETA_IA_MIX_URL } from "@/lib/criacao/ingestTicket";
import { signVinhetaUpload } from "@/lib/criacao/vinhetaSign";

export type VinhetaLabRow = {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  texto: string;
  voz: string;
  vozNome: string;
  trilhaMusicaId: string | null;
  trilhaVinhetaId: string | null;
  trilhaTitulo: string | null;
  trilhaArtista: string | null;
  trilhaPreviewUrl: string | null;
  programacaoId: string | null;
  criativoNome: string;
  temAudio: boolean;
  previewUrl: string | null;
  aprovadaEm: string | null;
  createdAt: string;
  updatedAt: string;
};

const vinhetaMixUrl = VINHETA_IA_MIX_URL;

async function mapLabRow(v: {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  texto: string;
  voz: string;
  vozNome: string;
  trilhaMusicaId: string | null;
  trilhaVinhetaId: string | null;
  programacaoId: string | null;
  criativoNome: string;
  storageKey: string | null;
  aprovadaEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<VinhetaLabRow> {
  let trilhaTitulo: string | null = null;
  let trilhaArtista: string | null = null;
  let trilhaPreviewUrl: string | null = null;
  if (v.trilhaVinhetaId) {
    const t = await prisma.vinhetaTrilha.findUnique({
      where: { id: v.trilhaVinhetaId },
      select: { nome: true, storageKey: true },
    });
    if (t) {
      trilhaTitulo = t.nome;
      trilhaArtista = "Trilha Vinhetas";
      trilhaPreviewUrl = t.storageKey ? buildVinhetaTrilhaPreviewUrl(v.trilhaVinhetaId) : null;
    }
  } else if (v.trilhaMusicaId) {
    const m = await prisma.musicaBiblioteca.findUnique({
      where: { id: v.trilhaMusicaId },
      select: { titulo: true, artista: true, versoes: { select: { formato: true } } },
    });
    if (m) {
      trilhaTitulo = m.titulo;
      trilhaArtista = m.artista;
      const fmt = pickLowestPreviewFormato(m.versoes);
      trilhaPreviewUrl = fmt ? buildPreviewUrl(v.trilhaMusicaId, fmt) : null;
    }
  }
  return {
    id: v.id,
    nome: v.nome,
    tipo: v.tipo,
    status: v.status,
    texto: v.texto,
    voz: v.voz,
    vozNome: v.vozNome,
    trilhaMusicaId: v.trilhaMusicaId,
    trilhaVinhetaId: v.trilhaVinhetaId,
    trilhaTitulo,
    trilhaArtista,
    trilhaPreviewUrl,
    programacaoId: v.programacaoId,
    criativoNome: v.criativoNome,
    temAudio: Boolean(v.storageKey),
    previewUrl: v.storageKey ? buildVinhetaPreviewUrl(v.id) : null,
    aprovadaEm: v.aprovadaEm?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export async function listVinhetasLab(opts: {
  sessionEmail: string;
  status?: "aprovada" | "all";
}): Promise<VinhetaLabRow[]> {
  const where =
    opts.status === "aprovada" ?
      {
        tipo: "ia" as const,
        status: "aprovada" as const,
        programacaoId: null,
      }
    : {
        tipo: "ia" as const,
        criativoUserId: opts.sessionEmail,
      };
  const rows = await prisma.vinheta.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
  });
  return Promise.all(rows.map(mapLabRow));
}

export async function createVinhetaLabDraft(input: {
  nome: string;
  texto: string;
  voz: string;
  vozNome: string;
  trilhaMusicaId?: string | null;
  trilhaVinhetaId?: string | null;
  criativoUserId: string;
  criativoNome: string;
}): Promise<VinhetaLabRow> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const row = await prisma.vinheta.create({
    data: {
      nome: nome.slice(0, 160),
      tipo: "ia",
      status: "rascunho",
      texto: input.texto.slice(0, 4000),
      voz: input.voz.slice(0, 80),
      vozNome: input.vozNome.slice(0, 120),
      trilhaMusicaId: input.trilhaMusicaId || null,
      trilhaVinhetaId: input.trilhaVinhetaId || null,
      criativoUserId: input.criativoUserId,
      criativoNome: input.criativoNome.slice(0, 120),
    },
  });
  return mapLabRow(row);
}

export async function updateVinhetaLabDraft(
  id: string,
  patch: {
    nome?: string;
    texto?: string;
    voz?: string;
    vozNome?: string;
    trilhaMusicaId?: string | null;
    trilhaVinhetaId?: string | null;
  },
): Promise<VinhetaLabRow> {
  const data: Record<string, unknown> = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 160);
  if (typeof patch.texto === "string") data.texto = patch.texto.slice(0, 4000);
  if (typeof patch.voz === "string") data.voz = patch.voz.slice(0, 80);
  if (typeof patch.vozNome === "string") data.vozNome = patch.vozNome.slice(0, 120);
  if (patch.trilhaMusicaId !== undefined) data.trilhaMusicaId = patch.trilhaMusicaId || null;
  if (patch.trilhaVinhetaId !== undefined) data.trilhaVinhetaId = patch.trilhaVinhetaId || null;
  if (Object.keys(data).length === 0) throw new Error("nada_para_atualizar");
  const row = await prisma.vinheta.update({ where: { id }, data });
  return mapLabRow(row);
}

export async function generateVinhetaLab(id: string, sessionEmail: string): Promise<VinhetaLabRow> {
  const row = await prisma.vinheta.findUnique({ where: { id } });
  if (!row || row.tipo !== "ia") throw new Error("vinheta_nao_encontrada");
  if (!row.texto.trim()) throw new Error("texto_obrigatorio");
  if (!row.voz.trim()) throw new Error("voz_obrigatoria");
  if (!row.trilhaVinhetaId && !row.trilhaMusicaId) throw new Error("trilha_obrigatoria");

  const apiKey = await resolveElevenLabsApiKey(sessionEmail);
  if (!apiKey) throw new Error("elevenlabs_nao_configurado");

  await prisma.vinheta.update({ where: { id }, data: { status: "gerando" } });

  try {
    const voiceMp3 = await synthesizeElevenLabsSpeech({
      apiKey,
      voiceId: row.voz,
      text: row.texto,
    });

    const { token } = signVinhetaUpload(id);
    const fd = new FormData();
    fd.append("token", token);
    fd.append("voice", new Blob([new Uint8Array(voiceMp3)], { type: "audio/mpeg" }), "voice.mp3");
    if (row.trilhaVinhetaId) fd.append("trilhaVinhetaId", row.trilhaVinhetaId);
    else if (row.trilhaMusicaId) fd.append("trilhaMusicaId", row.trilhaMusicaId);

    const mixRes = await fetch(vinhetaMixUrl, { method: "POST", body: fd });
    if (!mixRes.ok) {
      const err = await mixRes.text().catch(() => "");
      throw new Error(`mix_falhou:${err.slice(0, 160)}`);
    }

    const updated = await prisma.vinheta.update({
      where: { id },
      data: { status: "preview" },
    });
    return mapLabRow(updated);
  } catch (e) {
    await prisma.vinheta.update({ where: { id }, data: { status: "rascunho" } });
    throw e;
  }
}

export async function aprovarVinhetaLab(id: string): Promise<VinhetaLabRow> {
  const row = await prisma.vinheta.findUnique({ where: { id } });
  if (!row || row.tipo !== "ia") throw new Error("vinheta_nao_encontrada");
  if (!row.storageKey) throw new Error("audio_ausente");
  const updated = await prisma.vinheta.update({
    where: { id },
    data: { status: "aprovada", aprovadaEm: new Date() },
  });
  return mapLabRow(updated);
}

export async function anexarVinhetaLabEmProgramacao(
  vinhetaId: string,
  programacaoId: string,
): Promise<{ id: string; nome: string }> {
  const src = await prisma.vinheta.findUnique({ where: { id: vinhetaId } });
  if (!src || src.tipo !== "ia" || src.status !== "aprovada" || !src.storageKey) {
    throw new Error("vinheta_indisponivel");
  }
  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const clone = await prisma.vinheta.create({
    data: {
      programacaoId,
      nome: src.nome,
      tipo: "ia",
      status: "aprovada",
      texto: src.texto,
      voz: src.voz,
      vozNome: src.vozNome,
      trilhaMusicaId: src.trilhaMusicaId,
      trilhaVinhetaId: src.trilhaVinhetaId,
      trilhaStorageKey: src.trilhaStorageKey,
      criativoUserId: src.criativoUserId,
      criativoNome: src.criativoNome,
      aprovadaEm: new Date(),
    },
    select: { id: true, nome: true },
  });

  const { token } = signVinhetaUpload(clone.id);
  const cloneRes = await fetch(VINHETA_CLONE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, sourceVinhetaId: src.id, targetVinhetaId: clone.id }),
  });
  if (!cloneRes.ok) {
    await prisma.vinheta.delete({ where: { id: clone.id } });
    throw new Error("clone_falhou");
  }

  return clone;
}

export async function getElevenLabsVoicesForUser(sessionEmail: string) {
  const { getPresetVoices, presetVoicesToElevenLabs } = await import("@/lib/criacao/vinhetaPresetsService");
  const presetVoices = await getPresetVoices();
  const apiKey = await resolveElevenLabsApiKey(sessionEmail);
  if (!apiKey) {
    return {
      configured: false,
      presetOnly: presetVoices.length > 0,
      voices: presetVoicesToElevenLabs(presetVoices),
      error: presetVoices.length > 0 ? "elevenlabs_nao_configurada" : null,
    };
  }
  if (presetVoices.length > 0) {
    return {
      configured: true,
      presetOnly: true,
      voices: presetVoicesToElevenLabs(presetVoices),
      error: null,
    };
  }
  try {
    const voices = await listElevenLabsVoices(apiKey);
    return { configured: true, presetOnly: false, voices, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "elevenlabs_voices_failed";
    return {
      configured: true,
      presetOnly: false,
      voices: [] as Awaited<ReturnType<typeof listElevenLabsVoices>>,
      error: msg,
    };
  }
}
