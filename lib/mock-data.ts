import type { ClientRow } from "./types";

/** Dados de demonstração — substituídos pela API Conta Azul na integração. */
export const mockClients: ClientRow[] = [
  {
    id: "c1",
    fantasy: "Distribuidora Sul Ltda",
    cnpj: "12.345.678/0001-90",
    email: "financeiro@distsul.com.br",
    sales: [
      {
        id: "s1",
        comp: "2025-10-05",
        due: "2026-02-01",
        summary: "NF-e 88421 — mix produtos",
        value: 12890.5,
      },
      {
        id: "s2",
        comp: "2025-11-12",
        due: "2026-03-10",
        summary: "Ref. pedido 4421",
        value: 4200,
      },
      {
        id: "s3",
        comp: "2026-01-08",
        due: "2026-04-02",
        summary: "Serviços logística Jan/26",
        value: 3150.75,
      },
    ],
  },
  {
    id: "c2",
    fantasy: "Mercado Bom Preço",
    cnpj: "98.765.432/0001-10",
    email: "cobranca@bompreco.com",
    sales: [
      {
        id: "s4",
        comp: "2025-12-01",
        due: "2026-03-28",
        summary: "Fatura mensal dezembro",
        value: 18700,
      },
      {
        id: "s5",
        comp: "2026-02-14",
        due: "2026-04-30",
        summary: "Bonificação acordada — rateio",
        value: 960.2,
      },
    ],
  },
  {
    id: "c3",
    fantasy: "Ótica Visão Clara",
    cnpj: "45.678.901/0001-22",
    email: "faturamento@visaocara.com.br",
    sales: [
      {
        id: "s6",
        comp: "2026-03-01",
        due: "2026-04-05",
        summary: "Venda armações lote B",
        value: 5420,
      },
    ],
  },
];
