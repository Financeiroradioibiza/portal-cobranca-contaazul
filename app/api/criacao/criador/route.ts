import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listAgendamentosByProgramacaoIds, type AgendamentoRow } from "@/lib/criacao/agendamentoService";
import { prisma } from "@/lib/prisma";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";

export const runtime = "nodejs";

export type CriadorPastaMusica = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  mixSegundosFinais: number | null;
  previewUrl: string | null;
  addedAt: string | null;
  tagsManuais: { id: string; nome: string; cor: string; criativoNome: string }[];
};

export type CriadorPasta = {
  id: string;
  nome: string;
  selecionavel: boolean;
  musicasCount: number;
};

export type CriadorProg = {
  id: string;
  nome: string;
  publicada: boolean;
  atualizacaoAberta: boolean;
  agendamentos: AgendamentoRow[];
  pastas: CriadorPasta[];
};

export type CriadorCliente = {
  ref: string;
  nome: string;
  progs: CriadorProg[];
};

/** GET /api/criacao/criador — programações onde o usuário logado é dono. */
export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const email = session.email;

    const hasAberta = await hasAtualizacaoAbertaColumn();

    const progsRaw = hasAberta
      ? await prisma.programacao.findMany({
          where: { criativoUserId: email },
          orderBy: [{ clienteNome: "asc" }, { nome: "asc" }],
          select: {
            id: true,
            nome: true,
            clienteRef: true,
            clienteNome: true,
            publicada: true,
            atualizacaoAbertaEm: true,
            pastas: {
              orderBy: { sortOrder: "asc" as const },
              select: {
                id: true,
                nome: true,
                selecionavel: true,
                _count: { select: { musicas: true } },
              },
            },
          },
        })
      : await prisma.programacao.findMany({
          where: { criativoUserId: email },
          orderBy: [{ clienteNome: "asc" }, { nome: "asc" }],
          select: {
            id: true,
            nome: true,
            clienteRef: true,
            clienteNome: true,
            publicada: true,
            pastas: {
              orderBy: { sortOrder: "asc" as const },
              select: {
                id: true,
                nome: true,
                selecionavel: true,
                _count: { select: { musicas: true } },
              },
            },
          },
        });

    const progIds = progsRaw.map((p) => p.id);
    const agsByProg = await listAgendamentosByProgramacaoIds(progIds);

    // Agrupa por cliente
    const clienteMap = new Map<string, CriadorCliente>();
    for (const p of progsRaw) {
      let c = clienteMap.get(p.clienteRef);
      if (!c) {
        c = { ref: p.clienteRef, nome: p.clienteNome, progs: [] };
        clienteMap.set(p.clienteRef, c);
      }
      const abertaEm = hasAberta && "atualizacaoAbertaEm" in p ? (p as { atualizacaoAbertaEm: Date | null }).atualizacaoAbertaEm : null;
      c.progs.push({
        id: p.id,
        nome: p.nome,
        publicada: p.publicada,
        atualizacaoAberta: abertaEm instanceof Date,
        agendamentos: agsByProg.get(p.id) ?? [],
        pastas: p.pastas.map((f) => ({
          id: f.id,
          nome: f.nome,
          selecionavel: f.selecionavel,
          musicasCount: f._count.musicas,
        })),
      });
    }

    const clientes: CriadorCliente[] = [...clienteMap.values()];

    return NextResponse.json({ clientes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/criador GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
