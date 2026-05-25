#!/usr/bin/env bash
# Teste local — extrai UUID do hash da SPA e tenta baixar o mesmo PDF público do browser.
# Uso:
#   bash scripts/test-billing-charge-pdf.sh
#   bash scripts/test-billing-charge-pdf.sh <uuid-da-carga>
#
# Depois pode testar o portal ligado (`npm run dev`): expandir cliente → enviar e-mail agregado
# ou GET /api/contaazul/parcela/<id_parcela>/file?tipo=boleto com sessão válida.

set -euo pipefail
UUID="${1:-e9d79288-4388-11f1-a0b9-cbadac465fa8}"
SAMPLE_URL="https://faturas.contaazul.com/?tipo=boleto#/fatura/visualizar/${UUID}"
OUT="${TMPDIR:-/tmp}/ca-billing-charge-${UUID}.pdf"

echo "== 1) URL tipo SPA (exemplo) =="
echo "    ${SAMPLE_URL}"
echo ""
echo "== 2) UUID extraído (regex igual ao portal) =="
export SAMPLE_URL
node -e "
const s = process.env.SAMPLE_URL;
const U = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const e = s.match(new RegExp('#/+fatura/+visualizar/+(' + U + ')', 'i'))?.[1];
if (!e) { console.error('Falha ao extrair UUID'); process.exit(1); }
console.log('   ', e);
"
echo ""
echo "== 3) GET PDF público (precisa de internet; User-Agent como browser) =="
curl -sfSL -o "$OUT" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Origin: https://faturas.contaazul.com" \
  -H "Referer: https://faturas.contaazul.com/" \
  -H "Accept: application/pdf,application/octet-stream,*/*" \
  "https://public.contaazul.com/payments/billing/charge/file/${UUID}"

echo "    guardado: $OUT"
file "$OUT"
wc -c "$OUT" | awk '{print "    bytes:", $1}'
head -c 5 "$OUT" | od -An -tx1
echo ""
echo "✔ Se file diz 'PDF' e bytes > 10000, o mesmo fluxo do servidor do portal deve funcionar."
