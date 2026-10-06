export type EnvioManualGrupoCliente = {
  id: string;
  nome: string;
};

export type EnvioManualAgendamentoDto = {
  id: string;
  tipo: "individual" | "grupo";
  client: string;
  clienteId: string | null;
  day: number;
  rec: boolean;
  emails: string[];
  msg: string;
  colorIdx: number;
  sent: boolean;
  grupoClientes: EnvioManualGrupoCliente[] | null;
};

export type EnvioManualLogDto = {
  id: string;
  client: string;
  emails: string;
  dt: string;
  ref: string;
  ok: boolean;
  aviso: string | null;
  sandbox: boolean;
};
