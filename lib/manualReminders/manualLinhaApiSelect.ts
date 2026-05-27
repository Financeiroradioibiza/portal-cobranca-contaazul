import type { Prisma } from "@prisma/client";

/** Listagem Envios Manuais: colunas públicas sem o BYTEA do anexo OC. */
export const manualReminderLinhaApiSelect = {
  id: true,
  monthId: true,
  emissionDay: true,
  clienteNome: true,
  cnpjDocumento: true,
  contaAzulPersonId: true,
  solicitarPedirOc: true,
  anexarListagemClientesOc: true,
  status: true,
  emailCobranca: true,
  spreadsheetHint: true,
  notes: true,
  autoOcSentYmd: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  listagemClienteArquivoNome: true,
  listagemClienteArquivoMime: true,
} satisfies Prisma.ManualReminderRowSelect;

/** Para `findUnique`: linha pública + objeto `month` (sem BYTEA do anexo). */
export const manualReminderLinhaComMesApiSelect = {
  ...manualReminderLinhaApiSelect,
  month: true,
};
