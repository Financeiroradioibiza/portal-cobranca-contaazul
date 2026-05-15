export type SaleRow = {
  id: string;
  comp: string;
  due: string;
  summary: string;
  value: number;
};

export type ClientRow = {
  id: string;
  fantasy: string;
  cnpj: string;
  email: string;
  /** Só no portal; persistido até o cliente sair da listagem. */
  hasActiveContract: boolean;
  note: string;
  sales: SaleRow[];
};
