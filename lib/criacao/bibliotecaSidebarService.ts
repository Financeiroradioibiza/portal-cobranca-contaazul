import { prisma } from "@/lib/prisma";
import { listTags, type TagCriativoRow } from "@/lib/criacao/tagService";
import { listBibliotecaPastas, type BibliotecaPastaView } from "@/lib/criacao/bibliotecaPastaService";
import { listPastasEspeciais } from "@/lib/criacao/pastaEspecialService";
import {
  listOffArquivoForBibliotecaSidebar,
  type BibliotecaOffSidebarItem,
} from "@/lib/criacao/atualizacaoArquivoService";

export type BibliotecaSidebarTag = TagCriativoRow & { kind: "tag" };

export type BibliotecaSidebarPastaCustom = BibliotecaPastaView & { kind: "custom" };

export type BibliotecaSidebarPastaEspecial = {
  kind: "especial";
  id: string;
  nome: string;
  musicaCount: number;
  selecionavel: boolean;
};

export type BibliotecaSidebarPastaProgramacao = {
  kind: "prog";
  id: string;
  nome: string;
  musicaCount: number;
  programacaoId: string;
  programacaoNome: string;
  clienteNome: string;
  readOnly: true;
};

export type BibliotecaSidebarProgramacao = {
  id: string;
  nome: string;
  clienteNome: string;
  pastas: BibliotecaSidebarPastaProgramacao[];
  offs: BibliotecaOffSidebarItem[];
};

export type BibliotecaSidebarProgramacaoArquivada = {
  programacaoNome: string;
  clienteNome: string;
  offs: BibliotecaOffSidebarItem[];
};

export type BibliotecaSidebarTree = {
  tags: BibliotecaSidebarTag[];
  pastasCustom: BibliotecaSidebarPastaCustom[];
  pastasEspeciais: BibliotecaSidebarPastaEspecial[];
  programacoes: BibliotecaSidebarProgramacao[];
  programacoesArquivadas: BibliotecaSidebarProgramacaoArquivada[];
};

export async function loadBibliotecaSidebarTree(): Promise<BibliotecaSidebarTree> {
  const [tags, pastasCustom, especiais, progs, offIndex] = await Promise.all([
    listTags(),
    listBibliotecaPastas(),
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
    tags: tags.map((t) => ({ ...t, kind: "tag" as const })),
    pastasCustom: pastasCustom.map((p) => ({ ...p, kind: "custom" as const })),
    pastasEspeciais: especiais.map((p) => ({
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
