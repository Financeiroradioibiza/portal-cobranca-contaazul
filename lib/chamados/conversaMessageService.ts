import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { parseConversaReacaoTipo } from "@/lib/chamados/conversaConstants";
import type { ConversaReacaoTipo } from "@/lib/chamados/conversaConstants";

export type ConversaReacaoView = {
  tipo: ConversaReacaoTipo;
  count: number;
  mine: boolean;
};

export async function toggleConversaReacao(
  mensagemId: string,
  userEmail: string,
  tipoRaw: unknown,
): Promise<ConversaReacaoView[]> {
  const email = normalizePortalEmail(userEmail);
  const tipo = parseConversaReacaoTipo(tipoRaw);
  if (!tipo) throw new Error("reacao_invalida");

  const msg = await prisma.chamadoConversaMensagem.findUnique({ where: { id: mensagemId } });
  if (!msg) throw new Error("not_found");

  const existing = await prisma.chamadoConversaReacao.findUnique({
    where: { mensagemId_userEmail_tipo: { mensagemId, userEmail: email, tipo } },
  });
  if (existing) {
    await prisma.chamadoConversaReacao.delete({ where: { id: existing.id } });
  } else {
    await prisma.chamadoConversaReacao.create({
      data: { mensagemId, userEmail: email, tipo },
    });
  }

  return listReacoesForMensagem(mensagemId, email);
}

async function listReacoesForMensagem(mensagemId: string, viewerEmail: string): Promise<ConversaReacaoView[]> {
  const rows = await prisma.chamadoConversaReacao.findMany({ where: { mensagemId } });
  const byTipo = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = byTipo.get(r.tipo) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userEmail.toLowerCase() === viewerEmail.toLowerCase()) cur.mine = true;
    byTipo.set(r.tipo, cur);
  }
  return [...byTipo.entries()].map(([tipo, v]) => ({
    tipo: tipo as ConversaReacaoTipo,
    count: v.count,
    mine: v.mine,
  }));
}

export async function patchConversaMensagemEstado(
  mensagemId: string,
  userEmail: string,
  patch: { favorito?: boolean; forcarNaoLida?: boolean; marcarLida?: boolean },
): Promise<void> {
  const email = normalizePortalEmail(userEmail);
  const msg = await prisma.chamadoConversaMensagem.findUnique({ where: { id: mensagemId } });
  if (!msg) throw new Error("not_found");

  if (patch.marcarLida) {
    await prisma.chamadoConversaMsgEstado.upsert({
      where: { mensagemId_userEmail: { mensagemId, userEmail: email } },
      create: { mensagemId, userEmail: email, favorito: false, forcarNaoLida: false },
      update: { forcarNaoLida: false },
    });
    const lr = await prisma.chamadoConversaLeitura.findUnique({
      where: { assuntoId_userEmail: { assuntoId: msg.assuntoId, userEmail: email } },
    });
    const nextRead = msg.createdAt;
    if (!lr || lr.lastReadAt < nextRead) {
      await prisma.chamadoConversaLeitura.upsert({
        where: { assuntoId_userEmail: { assuntoId: msg.assuntoId, userEmail: email } },
        create: { assuntoId: msg.assuntoId, userEmail: email, lastReadAt: nextRead },
        update: { lastReadAt: nextRead },
      });
    }
    return;
  }

  const data: { favorito?: boolean; forcarNaoLida?: boolean } = {};
  if (patch.favorito !== undefined) data.favorito = patch.favorito;
  if (patch.forcarNaoLida !== undefined) data.forcarNaoLida = patch.forcarNaoLida;
  if (Object.keys(data).length === 0) return;

  await prisma.chamadoConversaMsgEstado.upsert({
    where: { mensagemId_userEmail: { mensagemId, userEmail: email } },
    create: {
      mensagemId,
      userEmail: email,
      favorito: patch.favorito ?? false,
      forcarNaoLida: patch.forcarNaoLida ?? false,
    },
    update: data,
  });
}

export async function loadReacoesForMensagens(
  mensagemIds: string[],
  viewerEmail: string,
): Promise<Map<string, ConversaReacaoView[]>> {
  const out = new Map<string, ConversaReacaoView[]>();
  if (mensagemIds.length === 0) return out;
  const rows = await prisma.chamadoConversaReacao.findMany({
    where: { mensagemId: { in: mensagemIds } },
  });
  const acc = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const id of mensagemIds) acc.set(id, new Map());
  for (const r of rows) {
    const m = acc.get(r.mensagemId)!;
    const cur = m.get(r.tipo) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userEmail.toLowerCase() === viewerEmail.toLowerCase()) cur.mine = true;
    m.set(r.tipo, cur);
  }
  for (const [id, m] of acc) {
    out.set(
      id,
      [...m.entries()].map(([tipo, v]) => ({
        tipo: tipo as ConversaReacaoTipo,
        count: v.count,
        mine: v.mine,
      })),
    );
  }
  return out;
}

export async function loadEstadosForMensagens(
  mensagemIds: string[],
  userEmail: string,
): Promise<Map<string, { favorito: boolean; forcarNaoLida: boolean }>> {
  const email = normalizePortalEmail(userEmail);
  const out = new Map<string, { favorito: boolean; forcarNaoLida: boolean }>();
  if (mensagemIds.length === 0) return out;
  const rows = await prisma.chamadoConversaMsgEstado.findMany({
    where: { mensagemId: { in: mensagemIds }, userEmail: email },
  });
  for (const r of rows) {
    out.set(r.mensagemId, { favorito: r.favorito, forcarNaoLida: r.forcarNaoLida });
  }
  return out;
}
