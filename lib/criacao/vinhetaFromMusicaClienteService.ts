import { prisma } from "@/lib/prisma";
import { VINHETA_FROM_MUSICA_URL } from "@/lib/criacao/ingestTicket";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { signVinhetaUpload, vinhetaIngestUrl } from "@/lib/criacao/vinhetaSign";

const IMPORT_ERRORS: Record<string, string> = {
  musica_nao_vinheta_cliente: "Esta faixa não está na pasta Vinhetas clientes.",
  musica_indisponivel: "Faixa indisponível ou ainda não concluiu a fila (status pronta).",
  musica_uso_ausente: "Áudio 128 mono ainda não está no cloud2 — aguarde a fila ou tente de novo.",
  stream_desabilitado: "Preview desabilitado (CRIACAO_INGEST_SECRET no portal).",
  copia_falhou: "Não foi possível copiar o áudio no servidor.",
  ingest_falhou: "Falha ao gravar vinheta no cloud2.",
  parametros_invalidos: "Dados inválidos.",
  programacao_nao_encontrada: "Programação não encontrada.",
  rota_nao_encontrada: "Serviço de importação indisponível — aguarde o deploy do portal.",
};

export function vinhetaClienteImportErrorMessage(code: string): string {
  return IMPORT_ERRORS[code] ?? `Não foi possível importar (${code}).`;
}

async function copyMusicaUsoToVinhetaCloud2(vinhetaId: string, musicaId: string): Promise<void> {
  const { token } = signVinhetaUpload(vinhetaId);

  const direct = await fetch(VINHETA_FROM_MUSICA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, musicaId, targetVinhetaId: vinhetaId }),
  });
  if (direct.ok) return;

  const useFallback = direct.status === 404 || direct.status === 405;
  if (!useFallback) {
    const body = (await direct.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "copia_falhou");
  }

  /** cloud2 prod ainda sem /vinheta-from-musica — usa /audio + vinheta-ingest (já existentes). */
  const previewUrl = buildPreviewUrl(musicaId, "mp3_128_mono");
  if (!previewUrl) throw new Error("stream_desabilitado");

  const audioRes = await fetch(previewUrl);
  if (!audioRes.ok) throw new Error("musica_uso_ausente");

  const buf = Buffer.from(await audioRes.arrayBuffer());
  const fd = new FormData();
  fd.append("token", token);
  fd.append("file", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), "vinheta.mp3");

  const ingest = await fetch(vinhetaIngestUrl(), { method: "POST", body: fd });
  if (!ingest.ok) {
    const body = (await ingest.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "ingest_falhou");
  }

  await prisma.vinheta.update({
    where: { id: vinhetaId },
    data: { status: "aprovada" },
  });
}

export async function criarVinhetaProgramacaoFromMusicaCliente(args: {
  programacaoId: string;
  musicaId: string;
  nome?: string;
}): Promise<{ id: string; nome: string }> {
  const musicaId = args.musicaId.trim();
  const programacaoId = args.programacaoId.trim();
  if (!musicaId || !programacaoId) throw new Error("parametros_invalidos");

  const link = await prisma.bibliotecaVinhetaCliente.findUnique({ where: { musicaId } });
  if (!link) throw new Error("musica_nao_vinheta_cliente");

  const musica = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    select: { id: true, titulo: true, artista: true, status: true },
  });
  if (!musica || musica.status !== "pronta") throw new Error("musica_indisponivel");

  const prog = await prisma.programacao.findUnique({ where: { id: programacaoId }, select: { id: true } });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const nome =
    (args.nome ?? "").trim() ||
    musica.titulo.trim() ||
    `${musica.artista}`.trim() ||
    "Vinheta cliente";

  const vinheta = await prisma.vinheta.create({
    data: {
      programacaoId,
      nome: nome.slice(0, 160),
      tipo: "audio",
      status: "rascunho",
    },
    select: { id: true, nome: true },
  });

  try {
    await copyMusicaUsoToVinhetaCloud2(vinheta.id, musicaId);
  } catch (e) {
    await prisma.vinheta.delete({ where: { id: vinheta.id } }).catch(() => null);
    throw e;
  }

  return vinheta;
}
