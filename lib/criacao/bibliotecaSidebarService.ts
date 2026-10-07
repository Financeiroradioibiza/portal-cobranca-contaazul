import { prisma } from "@/lib/prisma";
import { listTags } from "@/lib/criacao/tagService";
import { listBibliotecaPastas } from "@/lib/criacao/bibliotecaPastaService";
import { listPastasEspeciais } from "@/lib/criacao/pastaEspecialService";
import { countVinhetasClientesBiblioteca } from "@/lib/criacao/vinhetaClienteBibliotecaService";
import { listOffArquivoForBibliotecaSidebar } from "@/lib/criacao/atualizacaoArquivoService";
import type { BibliotecaSidebarTree } from "@/lib/criacao/bibliotecaClientTypes";

export type {
  BibliotecaOffSidebarItem,
  BibliotecaSidebarPastaCustom,
  BibliotecaSidebarPastaEspecial,
  BibliotecaSidebarPastaProgramacao,
  BibliotecaSidebarProgramacao,
  BibliotecaSidebarProgramacaoArquivada,
  BibliotecaSidebarTag,
  BibliotecaSidebarTree,
} from "@/lib/criacao/bibliotecaClientTypes";

export async function loadBibliotecaSidebarTree(): Promise<BibliotecaSidebarTree> {
  const [tags, pastasCustom, vinhetasClientesCount, especiais, progs, offIndex] = await Promise.all([
    listTags(),
    listBibliotecaPastas(),
    countVinhetasClientesBiblioteca(),
    listPastasEspeciais(),
    prisma.programacao.findMany({
      orderBy: [{ clienteNome: "asc" }, { nome: "asc" }],
      take: 300,
      select: {
        id: true,
        nome: true,
        clienteNome: true,
        pastas: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            nome: true,
            _count: { select: { musicas: true } },
          },
        },
      },
    }),
    listOffArquivoForBibliotecaSidebar(),
  ]);

  return {
    tags: tags.filter((t) => t.usoCount > 0).map((t) => ({ ...t, kind: "tag" as const })),
    pastasCustom: pastasCustom.map((p) => ({ ...p, kind: "custom" as const })),
    vinhetasClientesCount,
    pastasEspeciais: especiais
      .filter((p) => p.musicaCount > 0)
      .map((p) => ({
      kind: "especial" as const,
      id: p.id,
      nome: p.nome,
      musicaCount: p.musicaCount,
      selecionavel: p.selecionavel,
    })),
    programacoes: progs.map((prog) => ({
      id: prog.id,
      nome: prog.nome,
      clienteNome: prog.clienteNome,
      offs: offIndex.byProgramacaoId.get(prog.id) ?? [],
      pastas: prog.pastas.map((pa) => ({
        kind: "prog" as const,
        id: pa.id,
        nome: pa.nome,
        musicaCount: pa._count.musicas,
        programacaoId: prog.id,
        programacaoNome: prog.nome,
        clienteNome: prog.clienteNome,
        readOnly: true as const,
      })),
    })),
    programacoesArquivadas: offIndex.arquivadas.filter((a) => a.offs.length > 0),
  };
}
