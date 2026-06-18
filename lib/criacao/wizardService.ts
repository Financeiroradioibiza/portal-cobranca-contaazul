import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type WizardBucket = { pct: number; frase: string; tagId: string | null; tagNome: string | null };
export type WizardInterpretacao = {
  total: number;
  bpmMin: number | null;
  bpmMax: number | null;
  excludeRejected: boolean;
  preferLeastUsed: boolean;
  buckets: WizardBucket[];
};
export type WizardFaixa = {
  id: string;
  titulo: string;
  artista: string;
  bpm: number | null;
  motivo: string;
  previewUrl: string | null;
};

export type WizardResultado = {
  interpretacao: WizardInterpretacao;
  faixas: WizardFaixa[];
  avisos: string[];
};

function parseInstrucao(
  instrucao: string,
  tags: { id: string; nome: string }[],
  totalArg?: number,
): WizardInterpretacao {
  const txt = norm(instrucao);

  let total = totalArg && totalArg > 0 ? Math.round(totalArg) : 0;
  if (!total) {
    const mt = txt.match(/(\d{1,3})\s*(faixas|musicas|itens|tracks)/);
    total = mt ? parseInt(mt[1], 10) : 30;
  }
  total = Math.min(200, Math.max(1, total));

  let bpmMin: number | null = null;
  let bpmMax: number | null = null;
  const entre = txt.match(/bpm[^\d]{0,12}(\d{2,3})\s*(?:e|a|-|ate|até)\s*(\d{2,3})/);
  if (entre) {
    bpmMin = Math.min(+entre[1], +entre[2]);
    bpmMax = Math.max(+entre[1], +entre[2]);
  } else {
    const abaixo = txt.match(/(?:abaixo|menor|menos|ate|até|<)\s*(?:de|que)?\s*(\d{2,3})\s*bpm|bpm[^\d]{0,12}(?:abaixo|menor|menos|ate|até|<)\s*(?:de|que)?\s*(\d{2,3})/);
    if (abaixo) bpmMax = parseInt(abaixo[1] || abaixo[2], 10);
    const acima = txt.match(/(?:acima|maior|mais|>)\s*(?:de|que)?\s*(\d{2,3})\s*bpm|bpm[^\d]{0,12}(?:acima|maior|mais|>)\s*(?:de|que)?\s*(\d{2,3})/);
    if (acima) bpmMin = parseInt(acima[1] || acima[2], 10);
  }

  const excludeRejected = /rejeit/.test(txt);
  const preferLeastUsed = /menos\s*(usad|toc)|pouco\s*(usad|toc)/.test(txt);

  // Percentuais: "40% lounge style lauro, 30% bossa up fernando ..."
  const buckets: WizardBucket[] = [];
  const re = /(\d{1,3})\s*%\s*([^,.;]+?)(?=(?:\s*,|\s*;|\s*\.|\s*\d{1,3}\s*%|$))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    const pct = parseInt(m[1], 10);
    const frase = m[2].trim();
    if (!frase || pct <= 0) continue;
    // melhor tag: nome contido na frase (preferindo o nome mais longo)
    let best: { id: string; nome: string } | null = null;
    for (const t of tags) {
      const tn = norm(t.nome);
      if (tn && frase.includes(tn)) {
        if (!best || tn.length > norm(best.nome).length) best = t;
      }
    }
    buckets.push({ pct, frase, tagId: best?.id ?? null, tagNome: best?.nome ?? null });
  }

  return { total, bpmMin, bpmMax, excludeRejected, preferLeastUsed, buckets };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function gerarPlaylist(instrucao: string, total?: number): Promise<WizardResultado> {
  const tags = await prisma.tagCriativo.findMany({ select: { id: true, nome: true } });
  const interp = parseInstrucao(instrucao || "", tags, total);
  const avisos: string[] = [];
  for (const b of interp.buckets) {
    if (!b.tagId) avisos.push(`Não encontrei uma tag para "${b.frase}" — usei o acervo geral nessa fatia.`);
  }

  // Filtro de BPM (mantém faixas sem BPM conhecido)
  const bpmAnd: Prisma.MusicaBibliotecaWhereInput[] = [];
  if (interp.bpmMax != null) bpmAnd.push({ OR: [{ bpm: null }, { bpm: { lte: interp.bpmMax } }] });
  if (interp.bpmMin != null) bpmAnd.push({ OR: [{ bpm: null }, { bpm: { gte: interp.bpmMin } }] });

  const where: Prisma.MusicaBibliotecaWhereInput = { status: "pronta" };
  if (bpmAnd.length) where.AND = bpmAnd;

  const [musicas, rejeitadas, uso] = await Promise.all([
    prisma.musicaBiblioteca.findMany({
      where,
      select: {
        id: true,
        titulo: true,
        artista: true,
        bpm: true,
        tagsManuais: { select: { tagId: true } },
        versoes: { select: { formato: true } },
      },
    }),
    interp.excludeRejected
      ? prisma.musicaRejeicao.findMany({ select: { musicaId: true }, distinct: ["musicaId"] })
      : Promise.resolve([] as { musicaId: string }[]),
    prisma.pastaMusica.groupBy({
      by: ["musicaId"],
      where: { pasta: { programacao: { publicada: true } } },
      _count: { musicaId: true },
    }),
  ]);

  const rejSet = new Set(rejeitadas.map((r) => r.musicaId));
  const usoMap = new Map(uso.map((u) => [u.musicaId, u._count.musicaId]));

  type Cand = {
    id: string;
    titulo: string;
    artista: string;
    bpm: number | null;
    tagIds: Set<string>;
    formatoUso: string | undefined;
    uso: number;
  };
  const candidatos: Cand[] = musicas
    .filter((m) => !rejSet.has(m.id))
    .map((m) => ({
      id: m.id,
      titulo: m.titulo,
      artista: m.artista,
      bpm: m.bpm,
      tagIds: new Set(m.tagsManuais.map((t) => t.tagId)),
      formatoUso: m.versoes.find((v) => v.formato === "mp3_128_mono")?.formato ?? m.versoes[0]?.formato,
      uso: usoMap.get(m.id) ?? 0,
    }));

  const ordena = (arr: Cand[]) =>
    interp.preferLeastUsed ? [...arr].sort((a, b) => a.uso - b.uso || Math.random() - 0.5) : shuffle(arr);

  const chosen: WizardFaixa[] = [];
  const usados = new Set<string>();

  const pushCand = (c: Cand, motivo: string) => {
    if (usados.has(c.id)) return false;
    usados.add(c.id);
    chosen.push({
      id: c.id,
      titulo: c.titulo,
      artista: c.artista,
      bpm: c.bpm,
      motivo,
      previewUrl: c.formatoUso ? buildPreviewUrl(c.id, c.formatoUso) : null,
    });
    return true;
  };

  // Buckets por percentual
  for (const b of interp.buckets) {
    const alvo = Math.max(0, Math.round((b.pct / 100) * interp.total));
    if (alvo === 0) continue;
    const pool = b.tagId ? candidatos.filter((c) => c.tagIds.has(b.tagId as string)) : candidatos;
    const ordenado = ordena(pool);
    let add = 0;
    for (const c of ordenado) {
      if (add >= alvo) break;
      if (pushCand(c, b.tagNome ? `${b.pct}% ${b.tagNome}` : `${b.pct}% ${b.frase}`)) add++;
    }
  }

  // Completa o restante com o acervo geral
  if (chosen.length < interp.total) {
    for (const c of ordena(candidatos)) {
      if (chosen.length >= interp.total) break;
      pushCand(c, "complemento");
    }
  }

  return { interpretacao: interp, faixas: chosen.slice(0, interp.total), avisos };
}
