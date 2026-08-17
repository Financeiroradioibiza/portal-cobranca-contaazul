import { prisma } from "@/lib/prisma";

async function pickNomeCopia(clienteRef: string, baseNome: string): Promise<string> {
  const stem = baseNome.trim().slice(0, 100) || "Programação";
  let candidate = `${stem}-copia`.slice(0, 120);
  let n = 2;
  while (
    await prisma.programacao.findFirst({
      where: { clienteRef, nome: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${stem}-copia-${n}`.slice(0, 120);
    n += 1;
  }
  return candidate;
}

export type DuplicateProgramacaoResult = {
  id: string;
  nome: string;
  pastasCount: number;
  musicasCount: number;
  vinhetasCount: number;
  agendamentosCount: number;
};

/** Cópia independente: pastas + faixas + vinhetas + cronogramas. Não publica no player. */
export async function duplicateProgramacao(
  sourceId: string,
  opts?: { nome?: string },
): Promise<DuplicateProgramacaoResult> {
  const source = await prisma.programacao.findUnique({
    where: { id: sourceId },
    include: {
      pastas: {
        orderBy: { sortOrder: "asc" },
        include: {
          musicas: { orderBy: { sortOrder: "asc" } },
        },
      },
      vinhetas: { orderBy: { createdAt: "asc" } },
      agendamentos: true,
    },
  });
  if (!source) throw new Error("not_found");

  const nome =
    opts?.nome?.trim() ?
      (await pickNomeCopia(source.clienteRef, opts.nome.trim()))
    : await pickNomeCopia(source.clienteRef, source.nome);

  return prisma.$transaction(async (tx) => {
    const created = await tx.programacao.create({
      data: {
        clienteRef: source.clienteRef,
        clienteNome: source.clienteNome,
        nome,
        formatoPadrao: source.formatoPadrao,
        criativoUserId: source.criativoUserId,
        criativoNome: source.criativoNome,
        publicada: false,
        revisionAtual: 0,
        publishedAt: null,
        clienteGatewayId: null,
        snapshotAtual: undefined,
        atualizacaoAbertaEm: null,
        atualizacaoAbertaPor: "",
      },
      select: { id: true },
    });

    const pastaIdMap = new Map<string, string>();
    let musicasCount = 0;

    for (const pasta of source.pastas) {
      const np = await tx.pasta.create({
        data: {
          programacaoId: created.id,
          nome: pasta.nome,
          velocidade: pasta.velocidade,
          selecionavel: pasta.selecionavel,
          sortOrder: pasta.sortOrder,
        },
        select: { id: true },
      });
      pastaIdMap.set(pasta.id, np.id);
      if (pasta.musicas.length > 0) {
        await tx.pastaMusica.createMany({
          data: pasta.musicas.map((pm) => ({
            pastaId: np.id,
            musicaId: pm.musicaId,
            sortOrder: pm.sortOrder,
            addedAt: pm.addedAt,
          })),
        });
        musicasCount += pasta.musicas.length;
      }
    }

    const vinhetaIdMap = new Map<string, string>();
    for (const v of source.vinhetas) {
      const nv = await tx.vinheta.create({
        data: {
          programacaoId: created.id,
          nome: v.nome,
          tipo: v.tipo,
          status: v.status,
          texto: v.texto,
          voz: v.voz,
          vozNome: v.vozNome,
          trilhaMusicaId: v.trilhaMusicaId,
          trilhaVinhetaId: v.trilhaVinhetaId,
          trilhaStorageKey: v.trilhaStorageKey,
          storageKey: v.storageKey,
          criativoUserId: v.criativoUserId,
          criativoNome: v.criativoNome,
          iaBedVolume: v.iaBedVolume,
          iaVoiceSpeed: v.iaVoiceSpeed,
          iaVoiceStability: v.iaVoiceStability,
          aprovadaEm: v.aprovadaEm,
        },
        select: { id: true },
      });
      vinhetaIdMap.set(v.id, nv.id);
    }

    const agendamentoIdMap = new Map<string, string>();

    function remapAlvoId(alvoTipo: string, alvoId: string): string | null {
      if (alvoTipo === "pasta") return pastaIdMap.get(alvoId) ?? null;
      if (alvoTipo === "vinheta") return vinhetaIdMap.get(alvoId) ?? null;
      return null;
    }

    for (const ag of source.agendamentos) {
      const newAlvoId = remapAlvoId(ag.alvoTipo, ag.alvoId);
      if (!newAlvoId) continue;
      const nag = await tx.agendamento.create({
        data: {
          programacaoId: created.id,
          alvoTipo: ag.alvoTipo,
          alvoId: newAlvoId,
          diasSemana: ag.diasSemana,
          horaInicio: ag.horaInicio,
          horaFim: ag.horaFim,
          dataInicio: ag.dataInicio,
          dataFim: ag.dataFim,
          frequenciaMin: ag.frequenciaMin,
          frequenciaMusicas: ag.frequenciaMusicas,
          prioridade: ag.prioridade,
          ativo: ag.ativo,
        },
        select: { id: true },
      });
      agendamentoIdMap.set(ag.id, nag.id);
    }

    return {
      id: created.id,
      nome,
      pastasCount: source.pastas.length,
      musicasCount,
      vinhetasCount: source.vinhetas.length,
      agendamentosCount: agendamentoIdMap.size,
    };
  });
}
