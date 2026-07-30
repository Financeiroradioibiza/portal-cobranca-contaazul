import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { markCriativoEntregueAuto, markSubidaFilaPainel } from "@/lib/criacao/atualizacaoPainelService";
import { addMusicasToPasta } from "@/lib/criacao/programacaoService";
import { buildServidorUpPastaUploadTag } from "@/lib/criacao/servidorUpUploadTag";
import { applyUploadTagForMusica } from "@/lib/criacao/uploadTagService";
import { prisma } from "@/lib/prisma";

export type ServidorUpAssignBibliotecaItem = {
  relativePath: string;
  musicaId: string;
  pastaId: string;
  pastaNome: string;
  uploadTagNome?: string;
};

export type ServidorUpAssignBibliotecaResult = {
  ok: boolean;
  assigned: number;
  skipped: number;
  errors: string[];
  byPasta: Array<{ pastaId: string; pastaNome: string; count: number }>;
};

/** Coloca faixa existente na pasta alvo + tag — sem Deemix nem fila completa. */
export async function assignServidorUpBibliotecaTracks(input: {
  items: ServidorUpAssignBibliotecaItem[];
  uploaderEmail: string;
  uploaderDisplayName: string;
}): Promise<ServidorUpAssignBibliotecaResult> {
  const errors: string[] = [];
  let assigned = 0;
  let skipped = 0;
  const byPastaMap = new Map<string, { pastaNome: string; count: number }>();

  const byPasta = new Map<string, ServidorUpAssignBibliotecaItem[]>();
  for (const item of input.items) {
    if (!item.musicaId || !item.pastaId) {
      skipped++;
      continue;
    }
    const list = byPasta.get(item.pastaId) ?? [];
    list.push(item);
    byPasta.set(item.pastaId, list);
  }

  for (const [pastaId, group] of byPasta) {
    const pasta = await prisma.pasta.findUnique({
      where: { id: pastaId },
      select: { id: true, nome: true, programacaoId: true },
    });
    if (!pasta?.programacaoId) {
      errors.push(`pasta_invalida:${pastaId}`);
      skipped += group.length;
      continue;
    }

    const musicaIds = [...new Set(group.map((g) => g.musicaId))];
    const added = await addMusicasToPasta(pastaId, musicaIds);
    assigned += added;
    skipped += musicaIds.length - added;

    const pastaNome = group[0]?.pastaNome || pasta.nome;
    byPastaMap.set(pastaId, { pastaNome, count: (byPastaMap.get(pastaId)?.count ?? 0) + added });

    for (const item of group) {
      const tagBase = (item.uploadTagNome ?? "").trim() || item.pastaNome || pasta.nome;
      const tagNome = buildServidorUpPastaUploadTag(tagBase);
      await applyUploadTagForMusica({
        musicaId: item.musicaId,
        tagNome,
        criativoUserId: input.uploaderEmail,
        criativoNome: input.uploaderDisplayName,
      }).catch(() => false);
    }

    await abrirAtualizacao(pasta.programacaoId, input.uploaderDisplayName);
    await markCriativoEntregueAuto(pasta.programacaoId, input.uploaderDisplayName);
    await markSubidaFilaPainel(pasta.programacaoId, `assign:${pastaId}:${Date.now()}`, input.uploaderDisplayName);
  }

  return {
    ok: errors.length === 0,
    assigned,
    skipped,
    errors: errors.slice(0, 10),
    byPasta: [...byPastaMap.entries()].map(([pastaId, v]) => ({ pastaId, ...v })),
  };
}
