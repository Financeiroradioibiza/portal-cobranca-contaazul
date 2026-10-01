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
  prazoEntrega: string | null;
  templateKind: string | null;
  sequenciaGrupoId: string | null;
  sequenciaPasso: number | null;
  sequenciaTotal: number | null;
  sequenciaRotulo: string | null;
  /** Não lidos para o usuário da sessão (inbox). */
  unreadCount?: number;
};

export type ChamadosResumoView = {
  chamadosNaoLidos: number;
  conversasNaoLidas: number;
  conversasMencoes: number;
};

export type ChamadoParticipant = {
  userId: string;
  email: string;
  displayName: string;
  profileSlug: string;
  profileName: string;
  /** Cor hex das menções @ (Config → Usuários). */
  tagCor: string;
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

export type ChamadoComentarioAnexoView = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type ChamadoComentarioReacaoView = {
  tipo: string;
  emoji: string;
  label: string;
  count: number;
  mine: boolean;
};

export type ChamadoComentarioView = {
  id: string;
  chamadoId: string;
  corpo: string;
  autorEmail: string;
  autorNome: string;
  createdAt: string;
  anexos: ChamadoComentarioAnexoView[];
  reacoes: ChamadoComentarioReacaoView[];
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
