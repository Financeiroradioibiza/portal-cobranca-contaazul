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
  sales: SaleRow[];
};
