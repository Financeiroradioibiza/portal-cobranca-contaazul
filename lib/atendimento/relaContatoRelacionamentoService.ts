import { getClienteRelacionamentoDetail } from "@/lib/clientes/clientesRelacionamentoService";
import { prisma } from "@/lib/prisma";

export type RelaContatoRelacionamento = {
  nome: string;
  whatsapp: string;
  email: string;
};

export const EMPTY_RELA_CONTATO: RelaContatoRelacionamento = {
  nome: "",
  whatsapp: "",
  email: "",
};

function normalizeContato(input: RelaContatoRelacionamento): RelaContatoRelacionamento {
  return {
    nome: input.nome.trim().slice(0, 200),
    whatsapp: input.whatsapp.trim().slice(0, 40),
    email: input.email.trim().slice(0, 200),
  };
}

function rowToContato(row: {
  nome: string;
  whatsapp: string;
  email: string;
}): RelaContatoRelacionamento {
  return normalizeContato({
    nome: row.nome,
    whatsapp: row.whatsapp,
    email: row.email,
  });
}

export async function listRelaContatosByClienteKeys(
  keys: string[],
): Promise<Map<string, RelaContatoRelacionamento>> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  const out = new Map<string, RelaContatoRelacionamento>();
  if (unique.length === 0) return out;

  const rows = await prisma.relaClienteContatoRelacionamento.findMany({
    where: { clienteKey: { in: unique } },
  });
  for (const row of rows) {
    out.set(row.clienteKey, rowToContato(row));
  }
  return out;
}

export async function upsertRelaContatoRelacionamento(
  clienteKey: string,
  input: RelaContatoRelacionamento,
): Promise<RelaContatoRelacionamento> {
  const key = clienteKey.trim();
  if (!key) throw new Error("invalid_key");

  const cliente = await getClienteRelacionamentoDetail(key);
  if (!cliente) throw new Error("not_found");

  const data = normalizeContato(input);
  const row = await prisma.relaClienteContatoRelacionamento.upsert({
    where: { clienteKey: key },
    create: { clienteKey: key, ...data },
    update: data,
  });
  return rowToContato(row);
}
