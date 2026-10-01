import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { CONVERSA_REACOES, parseConversaReacaoTipo } from "@/lib/chamados/conversaConstants";

export type ChamadoComentarioReacaoView = {
  tipo: string;
  emoji: string;
  label: string;
  count: number;
  mine: boolean;
};

const emojiByTipo = new Map(CONVERSA_REACOES.map((r) => [r.id, r.emoji]));
const labelByTipo = new Map(CONVERSA_REACOES.map((r) => [r.id, r.label]));

export async function loadReacoesForComentarios(
  comentarioIds: string[],
  viewerEmail: string,
): Promise<Map<string, ChamadoComentarioReacaoView[]>> {
  const out = new Map<string, ChamadoComentarioReacaoView[]>();
  if (comentarioIds.length === 0) return out;
  const email = normalizePortalEmail(viewerEmail);
  const rows = await prisma.chamadoComentarioReacao.findMany({
    where: { comentarioId: { in: comentarioIds } },
  });
  const byComment = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of rows) {
    let tipoMap = byComment.get(r.comentarioId);
    if (!tipoMap) {
      tipoMap = new Map();
      byComment.set(r.comentarioId, tipoMap);
    }
    const cur = tipoMap.get(r.tipo) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userEmail.toLowerCase() === email.toLowerCase()) cur.mine = true;
    tipoMap.set(r.tipo, cur);
  }
  for (const id of comentarioIds) {
    const tipoMap = byComment.get(id);
    const views: ChamadoComentarioReacaoView[] = [];
    if (tipoMap) {
      for (const [tipo, { count, mine }] of tipoMap) {
        views.push({
          tipo,
          emoji: emojiByTipo.get(tipo as (typeof CONVERSA_REACOES)[number]["id"]) ?? "👍",
          label: labelByTipo.get(tipo as (typeof CONVERSA_REACOES)[number]["id"]) ?? tipo,
          count,
          mine,
        });
      }
    }
    out.set(id, views);
  }
  return out;
}

export async function toggleChamadoComentarioReacao(
  comentarioId: string,
  userEmail: string,
  tipoRaw: unknown,
): Promise<ChamadoComentarioReacaoView[]> {
  const tipo = parseConversaReacaoTipo(tipoRaw);
  if (!tipo) throw new Error("reacao_invalida");
  const email = normalizePortalEmail(userEmail);

  const msg = await prisma.chamadoComentario.findUnique({ where: { id: comentarioId } });
  if (!msg) throw new Error("not_found");

  const existing = await prisma.chamadoComentarioReacao.findUnique({
    where: { comentarioId_userEmail_tipo: { comentarioId, userEmail: email, tipo } },
  });
  if (existing) {
    await prisma.chamadoComentarioReacao.delete({ where: { id: existing.id } });
  } else {
    await prisma.chamadoComentarioReacao.create({
      data: { comentarioId, userEmail: email, tipo },
    });
  }

  const map = await loadReacoesForComentarios([comentarioId], email);
  return map.get(comentarioId) ?? [];
}
