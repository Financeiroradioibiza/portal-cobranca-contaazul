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

export type CnpjLookupError = "cnpj_invalido" | "cnpj_nao_encontrado" | "cnpj_lookup_falhou";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatCep(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 8) return raw.trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Valida dígitos verificadores do CNPJ (14 dígitos). */
export function isValidBrazilianCnpj(raw: string): boolean {
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(base[i]!) * w, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(digits, w1);
  const d2 = calc(digits.slice(0, 12) + String(d1), w2);
  return digits.endsWith(`${d1}${d2}`);
}

/** Consulta cadastro na Receita via Brasil API (público). */
export async function lookupCnpjReceita(
  raw: string,
): Promise<{ ok: true; data: CnpjLookupResult } | { ok: false; error: CnpjLookupError }> {
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return { ok: false, error: "cnpj_invalido" };
  if (!isValidBrazilianCnpj(digits)) return { ok: false, error: "cnpj_invalido" };

  let res: Response;
  try {
    res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "cnpj_lookup_falhou" };
  }

  if (res.status === 404) return { ok: false, error: "cnpj_nao_encontrado" };
  if (!res.ok) return { ok: false, error: res.status === 400 ? "cnpj_invalido" : "cnpj_lookup_falhou" };

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

  if (!razaoSocial && !endereco && !cidade) {
    return { ok: false, error: "cnpj_nao_encontrado" };
  }

  return {
    ok: true,
    data: {
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
    },
  };
}
