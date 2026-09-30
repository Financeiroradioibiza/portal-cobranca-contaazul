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
  rioLinhaId: string | null;
  rioPdvKey: string | null;
  clienteNome: string;
  createdAt: string;
  updatedAt: string;
};

export type ChamadoParticipant = {
  userId: string;
  email: string;
  displayName: string;
  profileSlug: string;
  profileName: string;
  hasAvatar: boolean;
  avatarVersion: string | null;
};

export type CreateChamadoInput = {
  titulo: string;
  descricao: string;
  prioridade: ChamadoPrioridade;
  setores: string[];
  responsaveis: string[];
  rioLinhaId?: string | null;
  rioPdvKey?: string | null;
  clienteNome?: string;
};

export type UpdateChamadoInput = {
  titulo?: string;
  descricao?: string;
  prioridade?: ChamadoPrioridade;
  status?: ChamadoStatus;
  setores?: string[];
  responsaveis?: string[];
  /** Salvar no portal — sempre notificar setores/responsáveis (como reenviar). */
  notificar?: boolean;
};
