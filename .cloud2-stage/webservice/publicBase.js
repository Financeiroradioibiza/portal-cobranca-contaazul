/** URL pública do webservice — usada em logotipo no loginByToken. */
export function publicWebserviceBase() {
  const raw =
    process.env.IBIZA_WEBSERVICE_PUBLIC_URL ||
    process.env.IBIZA_WEBSERVICE_URL ||
    'https://cloud.radioibiza.com.br/services/webservice';
  return String(raw).replace(/\/$/, '');
}

export function logotipoClienteUrl(token) {
  const t = String(token ?? '').trim();
  if (!t) return '';
  return `${publicWebserviceBase()}/api/logotipo_cliente/?token=${encodeURIComponent(t)}`;
}
