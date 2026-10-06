/** Tipos da UI da biblioteca — sem Prisma (safe para "use client"). */

import type { BibliotecaPastaView } from "@/lib/criacao/bibliotecaPastaShared";

export type MusicaTagManualView = {
  id: string;
  nome: string;
  cor: string;
  criativoIniciais: string;
  criativoNome: string;
  criativoUserId: string | null;
  criativoPortalUserId: string | null;
  criativoHasAvatar: boolean;
  criativoAvatarVersion: string | null;
};

export type BibliotecaSidebarTag = {
  kind: "tag";
  id: string;
  nome: string;
  cor: string;
  criativoNome: string;
  criativoUserId: string | null;
  criativoPortalUserId: string | null;
  criativoHasAvatar: boolean;
  criativoAvatarVersion: string | null;
  usoCount: number;
};

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

export type BibliotecaOffSidebarItem = {
  archiveId: string;
  rotulo: string;
  competencia: string;
  musicaCount: number;
  programacaoId: string | null;
  programacaoNome: string;
  programacaoExcluida: boolean;
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
