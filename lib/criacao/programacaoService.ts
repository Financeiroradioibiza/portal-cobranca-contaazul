import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { listAgendamentosByProgramacaoIds, type AgendamentoRow } from "@/lib/criacao/agendamentoService";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";
import { buildVinhetaPreviewUrl } from "@/lib/criacao/vinhetaSign";

export const FORMATOS = ["mp3_128_mono", "mp3_128_stereo", "mp3_192_mono", "mp3_192_stereo"] as const;
export type Formato = (typeof FORMATOS)[number];

export const FORMATO_LABEL: Record<Formato, string> = {
  mp3_128_mono: "128 kbps mono",
  mp3_128_stereo: "128 kbps estéreo",
  mp3_192_mono: "192 kbps mono",
  mp3_192_stereo: "192 kbps estéreo",
};

export const VELOCIDADES = ["baixa", "media", "alta"] as const;
export type Velocidade = (typeof VELOCIDADES)[number];

function isFormato(v: unknown): v is Formato {
  return typeof v === "string" && (FORMATOS as readonly string[]).includes(v);
}
function isVelocidade(v: unknown): v is Velocidade {
  return typeof v === "string" && (VELOCIDADES as readonly string[]).includes(v);
}

export type ProgramacaoListRow = {
  id: string;
  nome: string;
  clienteRef: string;
  clienteNome: string;
  formatoPadrao: string;
  publicada: boolean;
  criativoNome: string;
  pastasCount: number;
  musicasCount: number;
  updatedAt: string;
};

export type ArvorePastaNode = {
  id: string;
  nome: string;
  velocidade: string;
  selecionavel: boolean;
  musicasCount: number;
};

export type ArvoreVinhetaNode = {
  id: string;
  nome: string;
  tipo: string;
  temAudio: boolean;
  previewUrl: string | null;
};

export type ArvoreProgramacaoNode = {
  id: string;
  nome: string;
  formatoPadrao: string;
  publicada: boolean;
  atualizacaoAberta: boolean;
  pastas: ArvorePastaNode[];
  vinhetas: ArvoreVinhetaNode[];
  agendamentos: AgendamentoRow[];
};

export async function getClienteProgramacaoArvore(clienteRef: string): Promise<ArvoreProgramacaoNode[]> {
  const ref = clienteRef.trim();
  if (!ref) return [];

  const hasAberta = await hasAtualizacaoAbertaColumn();
  const pastasInclude = {
    orderBy: { sortOrder: "asc" as const },
    include: { _count: { select: { musicas: true } } },
  };
  const vinhetasSelect = {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, nome: true, tipo: true, storageKey: true },
  };

  const items = hasAberta
    ? await prisma.programacao.findMany({
        where: { clienteRef: ref },
        orderBy: [{ nome: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          nome: true,
          formatoPadrao: true,
          publicada: true,
          atualizacaoAbertaEm: true,
          pastas: pastasInclude,
          vinhetas: vinhetasSelect,
        },
      })
    : await prisma.programacao.findMany({
        where: { clienteRef: ref },
        orderBy: [{ nome: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          nome: true,
          formatoPadrao: true,
          publicada: true,
          pastas: pastasInclude,
          vinhetas: vinhetasSelect,
        },
      });

  const agendamentosByProg = await listAgendamentosByProgramacaoIds(items.map((p) => p.id));

  return items.map((p) => ({
    id: p.id,
    nome: p.nome,
    formatoPadrao: p.formatoPadrao,
    publicada: p.publicada,
    atualizacaoAberta: hasAberta && "atualizacaoAbertaEm" in p && p.atualizacaoAbertaEm != null,
    pastas: p.pastas.map((f) => ({
      id: f.id,
      nome: f.nome,
      velocidade: f.velocidade,
      selecionavel: f.selecionavel,
      musicasCount: f._count.musicas,
    })),
    vinhetas: p.vinhetas.map((v) => ({
      id: v.id,
      nome: v.nome,
      tipo: v.tipo,
      temAudio: Boolean(v.storageKey),
      previewUrl: v.storageKey ? buildVinhetaPreviewUrl(v.id) : null,
    })),
    agendamentos: agendamentosByProg.get(p.id) ?? [],
  }));
}

export async function listProgramacoes(opts: {
  search?: string;
  clienteRef?: string;
}): Promise<ProgramacaoListRow[]> {
  const where: Prisma.ProgramacaoWhereInput = {};
  if (opts.clienteRef) where.clienteRef = opts.clienteRef;
  const q = opts.search?.trim();
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { clienteNome: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.programacao.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      clienteNome: true,
      formatoPadrao: true,
      publicada: true,
      criativoNome: true,
      updatedAt: true,
      pastas: { select: { _count: { select: { musicas: true } } } },
    },
  });

  return items.map((p) => ({
    id: p.id,
    nome: p.nome,
    clienteRef: p.clienteRef,
    clienteNome: p.clienteNome,
    formatoPadrao: p.formatoPadrao,
    publicada: p.publicada,
    criativoNome: p.criativoNome,
    pastasCount: p.pastas.length,
    musicasCount: p.pastas.reduce((acc, f) => acc + f._count.musicas, 0),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function createProgramacao(input: {
  clienteRef: string;
  clienteNome: string;
  nome: string;
  formatoPadrao?: string;
  criativoUserId?: string;
  criativoNome?: string;
}) {
  const nome = (input.nome || "").trim();
  const clienteRef = (input.clienteRef || "").trim();
  if (!nome) throw new Error("nome_obrigatorio");
  if (!clienteRef) throw new Error("cliente_obrigatorio");

  return prisma.programacao.create({
    data: {
      clienteRef: clienteRef.slice(0, 120),
      clienteNome: (input.clienteNome ?? "").slice(0, 200),
      nome: nome.slice(0, 120),
      formatoPadrao: isFormato(input.formatoPadrao) ? input.formatoPadrao : "mp3_128_mono",
      criativoUserId: input.criativoUserId?.slice(0, 200) || null,
      criativoNome: (input.criativoNome ?? "").slice(0, 120),
    },
    select: { id: true },
  });
}

export type PastaMusicaView = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  status: string;
  mixSegundosFinais: number | null;
  previewUrl: string | null;
};

export type PastaView = {
  id: string;
  nome: string;
  velocidade: string;
  selecionavel: boolean;
  sortOrder: number;
  musicas: PastaMusicaView[];
};

export type ProgramacaoDetail = {
  id: string;
  nome: string;
  clienteRef: string;
  clienteNome: string;
  formatoPadrao: string;
  publicada: boolean;
  criativoNome: string;
  pastas: PastaView[];
};

export async function getProgramacao(id: string): Promise<ProgramacaoDetail | null> {
  const p = await prisma.programacao.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      clienteNome: true,
      formatoPadrao: true,
      publicada: true,
      criativoNome: true,
      pastas: {
        orderBy: { sortOrder: "asc" },
        include: {
          musicas: {
            orderBy: { sortOrder: "asc" },
            include: {
              musica: {
                select: {
                  id: true,
                  titulo: true,
                  artista: true,
                  durationMs: true,
                  status: true,
                  mixSegundosFinais: true,
                  versoes: { select: { formato: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!p) return null;

  return {
    id: p.id,
    nome: p.nome,
    clienteRef: p.clienteRef,
    clienteNome: p.clienteNome,
    formatoPadrao: p.formatoPadrao,
    publicada: p.publicada,
    criativoNome: p.criativoNome,
    pastas: p.pastas.map((f) => ({
      id: f.id,
      nome: f.nome,
      velocidade: f.velocidade,
      selecionavel: f.selecionavel,
      sortOrder: f.sortOrder,
      musicas: f.musicas.map((pm) => {
        const m = pm.musica;
        const formatoUso = pickLowestPreviewFormato(m.versoes);
        return {
          id: m.id,
          titulo: m.titulo,
          artista: m.artista,
          durationMs: m.durationMs,
          status: m.status,
          mixSegundosFinais: m.mixSegundosFinais,
          previewUrl: formatoUso ? buildPreviewUrl(m.id, formatoUso) : null,
        };
      }),
    })),
  };
}

export async function updateProgramacao(
  id: string,
  patch: { nome?: string; formatoPadrao?: string; publicada?: boolean },
): Promise<boolean> {
  const data: Prisma.ProgramacaoUpdateInput = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 120);
  if (isFormato(patch.formatoPadrao)) data.formatoPadrao = patch.formatoPadrao;
  if (typeof patch.publicada === "boolean") {
    data.publicada = patch.publicada;
    data.publishedAt = patch.publicada ? new Date() : null;
  }
  if (Object.keys(data).length === 0) return false;
  await prisma.programacao.update({ where: { id }, data });
  return true;
}

export async function deleteProgramacao(id: string): Promise<void> {
  await prisma.programacao.delete({ where: { id } });
}

export async function createPasta(
  programacaoId: string,
  input: { nome: string; velocidade?: string; selecionavel?: boolean },
) {
  const nome = (input.nome || "").trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const last = await prisma.pasta.findFirst({
    where: { programacaoId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return prisma.pasta.create({
    data: {
      programacaoId,
      nome: nome.slice(0, 120),
      velocidade: isVelocidade(input.velocidade) ? input.velocidade : "media",
      selecionavel: input.selecionavel === true,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
}

export async function updatePasta(
  id: string,
  patch: { nome?: string; velocidade?: string; selecionavel?: boolean },
): Promise<boolean> {
  const data: Prisma.PastaUpdateInput = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 120);
  if (isVelocidade(patch.velocidade)) data.velocidade = patch.velocidade;
  if (typeof patch.selecionavel === "boolean") data.selecionavel = patch.selecionavel;
  if (Object.keys(data).length === 0) return false;
  await prisma.pasta.update({ where: { id }, data });
  return true;
}

export async function deletePasta(id: string): Promise<void> {
  await prisma.pasta.delete({ where: { id } });
}

/** Adiciona músicas ao final da pasta, ignorando as que já estão na programação e ids inexistentes. */
export async function addMusicasToPasta(pastaId: string, musicaIds: string[]): Promise<number> {
  const ids = Array.from(new Set(musicaIds.filter((x) => typeof x === "string" && x)));
  if (ids.length === 0) return 0;

  const pasta = await prisma.pasta.findUnique({
    where: { id: pastaId },
    select: { programacaoId: true },
  });
  if (!pasta) return 0;

  const [validas, existentesNaProgramacao, last] = await Promise.all([
    prisma.musicaBiblioteca.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.pastaMusica.findMany({
      where: {
        musicaId: { in: ids },
        pasta: { programacaoId: pasta.programacaoId },
      },
      select: { musicaId: true },
    }),
    prisma.pastaMusica.findFirst({
      where: { pastaId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);

  const validSet = new Set(validas.map((v) => v.id));
  const jaTem = new Set(existentesNaProgramacao.map((e) => e.musicaId));
  const novos = ids.filter((id) => validSet.has(id) && !jaTem.has(id));
  if (novos.length === 0) return 0;

  let order = (last?.sortOrder ?? -1) + 1;
  await prisma.pastaMusica.createMany({
    data: novos.map((musicaId) => ({ pastaId, musicaId, sortOrder: order++ })),
    skipDuplicates: true,
  });
  return novos.length;
}

export async function removeMusicaFromPasta(pastaId: string, musicaId: string): Promise<void> {
  await prisma.pastaMusica.deleteMany({ where: { pastaId, musicaId } });
}

/** Remove várias faixas da pasta de uma vez. */
export async function removeMusicasFromPasta(pastaId: string, musicaIds: string[]): Promise<number> {
  const ids = Array.from(new Set(musicaIds.filter((x) => typeof x === "string" && x)));
  if (ids.length === 0) return 0;
  const result = await prisma.pastaMusica.deleteMany({
    where: { pastaId, musicaId: { in: ids } },
  });
  return result.count;
}

/** Reordena as músicas da pasta conforme a ordem da lista de ids fornecida. */
export async function reorderPastaMusicas(pastaId: string, musicaIds: string[]): Promise<void> {
  const ids = musicaIds.filter((x) => typeof x === "string" && x);
  await prisma.$transaction(
    ids.map((musicaId, idx) =>
      prisma.pastaMusica.updateMany({
        where: { pastaId, musicaId },
        data: { sortOrder: idx },
      }),
    ),
  );
}
