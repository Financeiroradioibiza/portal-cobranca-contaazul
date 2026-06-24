import { normalizeBrazilianTaxIdForStorage, onlyDigits } from "@/lib/format";

export type CnpjLookupResult = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatCep(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 8) return raw.trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Consulta cadastro na Receita via Brasil API (público). */
export async function lookupCnpjReceita(raw: string): Promise<CnpjLookupResult | null> {
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  const razaoSocial = str(data.razao_social);
  const nomeFantasia = str(data.nome_fantasia) || razaoSocial;
  const cep = formatCep(str(data.cep));
  const endereco = str(data.logradouro);
  const numero = str(data.numero);
  const complemento = str(data.complemento);
  const bairro = str(data.bairro);
  const cidade = str(data.municipio);
  const uf = str(data.uf).slice(0, 2).toUpperCase();

  if (!razaoSocial && !endereco && !cidade) return null;

  return {
    cnpj: normalizeBrazilianTaxIdForStorage(digits) ?? digits,
    razaoSocial,
    nomeFantasia,
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
  };
}
