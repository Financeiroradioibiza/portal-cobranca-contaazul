import type { ManualReminderRow, Prisma } from "@prisma/client";
import { manualReminderLinhaApiSelect } from "@/lib/manualReminders/manualLinhaApiSelect";

export type ManualReminderLinhaApiRow = Prisma.ManualReminderRowGetPayload<{
  select: typeof manualReminderLinhaApiSelect;
}>;

export type ManualReminderRowPayload = Omit<ManualReminderRow, "listagemClienteArquivo"> & {
  ocListagemAnexoPresente: boolean;
};

export function stripManualReminderRowBlob(
  row: ManualReminderRow | ManualReminderLinhaApiRow,
): ManualReminderRowPayload {
  const r = row as ManualReminderRow;
  const { listagemClienteArquivo: bin, ...rest } = r;
  const ocListagemAnexoPresente =
    !!(bin?.length ?? 0) || !!(rest.listagemClienteArquivoNome?.trim().length ?? 0);

  const { listagemClienteArquivo: __, ...withoutBlob } = r;
  void __;
  return {
    ...(withoutBlob as Omit<ManualReminderRow, "listagemClienteArquivo">),
    ocListagemAnexoPresente,
  };
}

export function stripManualReminderRowsBlob(
  rows: (ManualReminderRow | ManualReminderLinhaApiRow)[],
): ManualReminderRowPayload[] {
  return rows.map(stripManualReminderRowBlob);
}
