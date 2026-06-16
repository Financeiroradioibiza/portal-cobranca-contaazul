import type { ChamadoPrioridade, ChamadoStatus } from "@prisma/client";

export type ChamadoView = {
  id: string;
  titulo: string;
  descricao: string;
  status: ChamadoStatus;
  prioridade: ChamadoPrioridade;
  setores: string[];
  responsaveis: string[];
  criadoPorEmail: string;
  criadoPorNome: string;
  fechadoPorEmail: string | null;
  fechadoPorNome: string | null;
  fechadoEm: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChamadoParticipant = {
  email: string;
  displayName: string;
  profileSlug: string;
  profileName: string;
};

export type CreateChamadoInput = {
  titulo: string;
  descricao: string;
  prioridade: ChamadoPrioridade;
  setores: string[];
  responsaveis: string[];
};

export type UpdateChamadoInput = {
  titulo?: string;
  descricao?: string;
  prioridade?: ChamadoPrioridade;
  status?: ChamadoStatus;
  setores?: string[];
  responsaveis?: string[];
};
