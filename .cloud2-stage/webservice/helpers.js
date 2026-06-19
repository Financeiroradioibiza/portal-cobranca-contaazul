/** Helpers compartilhados pelas rotas webservice (contrato CakePHP / Player 5). */

export function formatLegacyDateTime(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function intervalToLegacyHms(value) {
  if (value == null) return '00:00:00';
  const s = String(value);
  const m = /^(\d+):(\d{2}):(\d{2})/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}`;
  return '00:00:00';
}

/** URL pública do webservice — Player 5 baixa MP3 daqui. */
export function apiPublicBaseUrl() {
  return (
    process.env.API_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    process.env.CLOUD2_PUBLIC_URL?.replace(/\/$/, '') ||
    'https://cloud2.radioibiza.app.br'
  );
}
