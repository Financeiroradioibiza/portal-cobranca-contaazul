import { extractBillingChargeUuidFromUrlString } from "./billingChargeFilePdf";
import { normalizeContaAzulUrl } from "./installmentLinks";
import type { CaInstallmentDetail } from "./types";

export type BoletoLinkForEmail = { label: string; href: string };

function tipoLooksBoletoSolicitation(t: string | undefined): boolean {
  if (!t) return false;
  const n = t.toUpperCase().replace(/-/g, "_");
  const xs = [
    "BOLETO",
    "BOLETO_REGISTRADO",
    "LINK_PAGAMENTO",
    "PIX_COBRANCA",
    "PIX",
    "COBRANCA",
    "BOLEPIX",
    "CHARGE_REQUEST",
    "CHARGE_REQUEST_ID_FALLBACK",
  ];
  return xs.some((c) => n === c || n.includes(c));
}

function inferBankShortLabel(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/(^|\.)itau\./i.test(h)) return "Itaú";
    if (/bradesco/i.test(h)) return "Bradesco";
    if (/bancointer|intermedium/i.test(h)) return "Inter";
    if (/(?:^|\.)bb\.com\.br/i.test(h)) return "Banco do Brasil";
    if (/banrisul/i.test(h)) return "Banrisul";
    if (/santander/i.test(h)) return "Santander";
    if (/sicredi/i.test(h)) return "Sicredi";
    if (/sicoob/i.test(h)) return "Sicoob";
    if (/caixa/i.test(h)) return "Caixa";
    return null;
  } catch {
    return null;
  }
}

function urlLooksLikeHostedBoleto(url: string): boolean {
  const u = url.toLowerCase();
  if (/faturas\.contaazul\.com.*fatura\/visualizar/.test(u)) return false;
  if (/boletoserver|(^|\.)itau\b|(^|\.)citibank|cob\d|bco/i.test(u)) return true;
  return /[/._-]boleto[/._-]?|linha.?digit|ficha.?compens|registro|arquivo.?cfe/i.test(
    u,
  );
}

/** URL como no portal: aba já em «boleto» + hash da fatura (UUID público para PDF/iugu). */
export function canonicalFaturasPortalBoletoUrl(visualizarPageUrl: string): string | null {
  const u = normalizeContaAzulUrl(visualizarPageUrl);
  if (!u || !/faturas\.contaazul\.com/i.test(u) || !/fatura\/visualizar/i.test(u))
    return null;
  const uuid = extractBillingChargeUuidFromUrlString(u);
  if (!uuid) return null;
  return `https://faturas.contaazul.com/?tipo=boleto#/fatura/visualizar/${uuid}`;
}

/**
 * Todos os boletos encontráveis na parcela (conta-Azul público vs banco/registradora),
 * sem duplicar o mesmo UUID de fatura.
 */
export function listBoletoLinksForInstallmentEmail(
  detail: CaInstallmentDetail,
): BoletoLinkForEmail[] {
  const byKey = new Map<string, BoletoLinkForEmail>();

  function addDedup(key: string, label: string, href: string) {
    const k = key.toLowerCase();
    if (byKey.has(k)) return;
    byKey.set(k, { label, href });
  }

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    const raw = normalizeContaAzulUrl(sc.url);
    if (!raw) continue;
    if (/faturas\.contaazul\.com/i.test(raw) && /fatura\/visualizar/i.test(raw)) {
      const canonical = canonicalFaturasPortalBoletoUrl(raw);
      const uuid =
        canonical?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
      const href = canonical ?? raw;
      addDedup(uuid ? `fatura:${uuid}` : href, "Boleto — fatura digital (Conta Azul)", href);
    }
  }

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    const raw = normalizeContaAzulUrl(sc.url);
    if (!raw) continue;
    if (/faturas\.contaazul\.com/i.test(raw) && /fatura\/visualizar/i.test(raw)) continue;

    const bank = inferBankShortLabel(raw);
    const tipoOk = tipoLooksBoletoSolicitation(sc.tipo_solicitacao_cobranca);
    const heur = !!bank || urlLooksLikeHostedBoleto(raw);

    if (!tipoOk && !heur && !/^https:\/\/api-v2\.contaazul\.com\//i.test(raw)) continue;
    /** Evitar fila genérica só da API quando não há sinal óbvio de boleto hospedado. */
    if (!tipoOk && !bank && /^https:\/\/api-v2\.contaazul\.com\//i.test(raw)) continue;

    const label = bank ? `Boleto (${bank})` : "Boleto (link do banco / registradora)";
    addDedup(raw, label, raw);
  }

  for (const a of detail.anexos ?? []) {
    const tAn = `${a.tipo_anexo ?? ""}`.toUpperCase();
    const raw = normalizeContaAzulUrl(a.url);
    if (!raw) continue;

    if (/(BOLETO|LINHA.?DIG)/i.test(tAn)) {
      if (/faturas\.contaazul\.com/i.test(raw) && /fatura\/visualizar/i.test(raw)) {
        const canonical = canonicalFaturasPortalBoletoUrl(raw);
        const uuid =
          canonical?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
        const href = canonical ?? raw;
        addDedup(uuid ? `fatura:${uuid}` : href, "Boleto — fatura digital (Conta Azul)", href);
      } else {
        const bank = inferBankShortLabel(raw);
        const label = bank ? `Boleto (${bank})` : "Boleto (anexo)";
        addDedup(raw, label, raw);
      }
      continue;
    }

    const blob =
      `${a.tipo_anexo ?? ""} ${a.nome ?? ""} ${a.descricao ?? ""}`.toLowerCase();
    if (/boleto|linha.?digit|ficha.?compensa/i.test(blob)) {
      if (/faturas\.contaazul\.com/i.test(raw) && /fatura\/visualizar/i.test(raw)) {
        const canonical = canonicalFaturasPortalBoletoUrl(raw);
        const uuid =
          canonical?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
        addDedup(uuid ? `fatura:${uuid}` : (canonical ?? raw), "Boleto — fatura digital (Conta Azul)", canonical ?? raw);
      } else {
        const bank = inferBankShortLabel(raw);
        const label = bank ? `Boleto (${bank})` : "Boleto";
        addDedup(raw, label, raw);
      }
    }
  }

  const vals = [...byKey.values()];
  vals.sort((a, b) => {
    const isDigital = (x: string) => /digital \(conta azul\)/i.test(x);
    if (isDigital(a.label) !== isDigital(b.label)) return isDigital(a.label) ? -1 : 1;
    return a.label.localeCompare(b.label, "pt");
  });

  return vals;
}
