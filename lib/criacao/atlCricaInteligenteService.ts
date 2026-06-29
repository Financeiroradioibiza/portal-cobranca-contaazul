import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type AtlCricaSugestaoFaixa = {
  id: string;
  titulo: string;
  artista: string;
  bpm: number | null;
  previewUrl: string | null;
  usoGlobal: number;
  motivo: string;
};

export type AtlCricaSugestaoPasta = {
  pastaId: string;
  pastaNome: string;
  programacaoId: string;
  programacaoNome: string;
  atualCount: number;
  alvoAcrescimo: number;
  tagNome: string | null;
  faixas: AtlCricaSugestaoFaixa[];
};

export type AtlCricaInteligenteResult = {
  ok: true;
  programacaoId: string;
  programacaoNome: string;
  pctAcrescimo: number;
  pastas: AtlCricaSugestaoPasta[];
  avisos: string[];
};

function matchTagForPasta(
  pastaNome: string,
  tags: { id: string; nome: string }[],
): { id: string; nome: string } | null {
  const pn = norm(pastaNome);
  let best: { id: string; nome: string } | null = null;
  for (const t of tags) {
    const tn = norm(t.nome);
    if (!tn) continue;
    if (pn.includes(tn) || tn.includes(pn)) {
      if (!best || tn.length > norm(best.nome).length) best = t;
    }
  }
  return best;
}

function alvoAcrescimo(atualCount: number, pct: number): number {
  if (atualCount <= 0) return 3;
  return Math.max(1, Math.min(25, Math.round(atualCount * pct)));
}

export async function sugerirAcrescimoInteligente(opts: {
  programacaoId: string;
  pctMin?: number;
  pctMax?: number;
  excludeMusicaIds?: string[];
}): Promise<AtlCricaInteligenteResult> {
  const pctMin = opts.pctMin ?? 0.1;
  const pctMax = opts.pctMax ?? 0.2;
  const pct = (pctMin + pctMax) / 2;

  const prog = await prisma.programacao.findUnique({
    where: { id: opts.programacaoId },
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      pastas: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          nome: true,
          musicas: { select: { musicaId: true } },
        },
      },
    },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const tags = await prisma.tagCriativo.findMany({ select: { id: true, nome: true } });

  const historicoRows = await prisma.pastaMusica.findMany({
    where: { pasta: { programacao: { clienteRef: prog.clienteRef } } },
    select: { musicaId: true },
    distinct: ["musicaId"],
  });
  const historicoCliente = new Set(historicoRows.map((r) => r.musicaId));

  const usoRows = await prisma.pastaMusica.groupBy({
    by: ["musicaId"],
    where: { pasta: { programacao: { publicada: true } } },
    _count: { musicaId: true },
  });
  const usoGlobal = new Map(usoRows.map((u) => [u.musicaId, u._count.musicaId]));

  const musicas = await prisma.musicaBiblioteca.findMany({
    where: { status: "pronta" },
    select: {
      id: true,
      titulo: true,
      artista: true,
      bpm: true,
      tagsManuais: { select: { tagId: true } },
      versoes: { select: { formato: true } },
    },
  });

  const exclude = new Set(opts.excludeMusicaIds ?? []);
  const avisos: string[] = [];
  const pastas: AtlCricaSugestaoPasta[] = [];

  for (const pasta of prog.pastas) {
    const naPasta = new Set(pasta.musicas.map((m) => m.musicaId));
    const alvo = alvoAcrescimo(pasta.musicas.length, pct);
    const tag = matchTagForPasta(pasta.nome, tags);

    type Cand = AtlCricaSugestaoFaixa & { tagIds: Set<string> };
    const pool: Cand[] = musicas
      .filter((m) => !naPasta.has(m.id) && !historicoCliente.has(m.id) && !exclude.has(m.id))
      .map((m) => {
        const formato = pickLowestPreviewFormato(m.versoes);
        return {
          id: m.id,
          titulo: m.titulo,
          artista: m.artista,
          bpm: m.bpm,
          previewUrl: formato ? buildPreviewUrl(m.id, formato) : null,
          usoGlobal: usoGlobal.get(m.id) ?? 0,
          motivo: tag ? `tag ${tag.nome}` : "acervo geral",
          tagIds: new Set(m.tagsManuais.map((t) => t.tagId)),
        };
      });

    const filtrado = tag ? pool.filter((c) => c.tagIds.has(tag.id)) : pool;
    if (tag && filtrado.length < alvo) {
      avisos.push(
        `Pasta “${pasta.nome}”: poucas faixas na tag “${tag.nome}” — complementando com acervo geral.`,
      );
    }

    const ordenado = [...(filtrado.length >= alvo ? filtrado : pool)].sort(
      (a, b) => a.usoGlobal - b.usoGlobal || a.titulo.localeCompare(b.titulo, "pt-BR"),
    );

    const escolhidas: AtlCricaSugestaoFaixa[] = [];
    for (const c of ordenado) {
      if (escolhidas.length >= alvo) break;
      escolhidas.push({
        id: c.id,
        titulo: c.titulo,
        artista: c.artista,
        bpm: c.bpm,
        previewUrl: c.previewUrl,
        usoGlobal: c.usoGlobal,
        motivo: c.motivo,
      });
    }

    if (escolhidas.length === 0) {
      avisos.push(`Pasta “${pasta.nome}”: nenhuma sugestão disponível no momento.`);
    }

    pastas.push({
      pastaId: pasta.id,
      pastaNome: pasta.nome,
      programacaoId: prog.id,
      programacaoNome: prog.nome,
      atualCount: pasta.musicas.length,
      alvoAcrescimo: alvo,
      tagNome: tag?.nome ?? null,
      faixas: escolhidas,
    });
  }

  return {
    ok: true,
    programacaoId: prog.id,
    programacaoNome: prog.nome,
    pctAcrescimo: Math.round(pct * 100),
    pastas,
    avisos,
  };
}

export async function aprovarSugestoesInteligente(opts: {
  programacaoId: string;
  aprovacoes: Array<{ pastaId: string; musicaIds: string[] }>;
}): Promise<{ added: number }> {
  let added = 0;
  for (const item of opts.aprovacoes) {
    const ids = [...new Set(item.musicaIds.filter(Boolean))];
    if (ids.length === 0) continue;
    const pasta = await prisma.pasta.findFirst({
      where: { id: item.pastaId, programacaoId: opts.programacaoId },
      select: { id: true, musicas: { select: { musicaId: true, sortOrder: true } } },
    });
    if (!pasta) continue;
    const existentes = new Set(pasta.musicas.map((m) => m.musicaId));
    let sortOrder = pasta.musicas.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;
    for (const musicaId of ids) {
      if (existentes.has(musicaId)) continue;
      await prisma.pastaMusica.create({
        data: { pastaId: pasta.id, musicaId, sortOrder: sortOrder++ },
      });
      added += 1;
    }
  }
  return { added };
}
