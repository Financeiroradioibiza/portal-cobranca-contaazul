import type { CaReceivableItem } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", ".").replace(/\s/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Contas a receber / buscar: normaliza snake_case, camelCase e objetos aninhados
 * para o shape usado no dashboard e no GET /parcelas/{id}.
 */
export function normalizeReceivableItem(raw: unknown): CaReceivableItem | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;

  const id_parcela =
    str(raw.id_parcela) ??
    str(raw.idParcela) ??
    str(raw.parcelaId) ??
    str(raw.parcela_id) ??
    (isRecord(raw.parcela) ? str(raw.parcela.id) : undefined) ??
    (isRecord(raw.parcelaFinanceira) ? str(raw.parcelaFinanceira.id) : undefined) ??
    (isRecord(raw.parcelaFinanceiro) ? str(raw.parcelaFinanceiro.id) : undefined);

  const data_vencimento =
    str(raw.data_vencimento) ??
    str(raw.dataVencimento) ??
    str(raw.data_vencimento_parcela) ??
    str(raw.dataVencimentoParcela) ??
    (isRecord(raw.parcela)
      ? str(raw.parcela.data_vencimento) ?? str(raw.parcela.dataVencimento)
      : undefined);

  const data_competencia =
    str(raw.data_competencia) ??
    str(raw.dataCompetencia) ??
    str(raw.competencia);

  const nao_pago =
    num(raw.nao_pago) ??
    num(raw.naoPago) ??
    num(raw.valorEmAberto) ??
    num(raw.valor_em_aberto) ??
    num(raw.saldoEmAberto) ??
    num(raw.saldo_em_aberto) ??
    num(raw.saldo) ??
    0;

  const total =
    num(raw.total) ?? num(raw.valorTotal) ?? num(raw.valor) ?? nao_pago ?? 0;

  const descricao =
    str(raw.descricao) ?? str(raw.description) ?? str(raw.memo) ?? "—";

  let cliente: { id: string; nome: string } | undefined;
  const cRaw = raw.cliente ?? raw.client ?? raw.pessoa ?? raw.customer;
  if (isRecord(cRaw)) {
    const cid =
      str(cRaw.id) ?? str(cRaw.idPessoa) ?? str(cRaw.id_cliente) ?? str(cRaw.idCliente);
    if (cid) {
      cliente = {
        id: cid,
        nome:
          str(cRaw.nome) ??
          str(cRaw.name) ??
          str(cRaw.fantasia) ??
          str(cRaw.razaoSocial) ??
          "",
      };
    }
  }

  return {
    id,
    id_parcela,
    idParcela: id_parcela,
    descricao,
    data_vencimento: data_vencimento ?? "",
    data_competencia,
    status: str(raw.status) ?? str(raw.statusParcela),
    status_traduzido: str(raw.status_traduzido) ?? str(raw.statusTraduzido),
    total,
    nao_pago,
    cliente,
  };
}
