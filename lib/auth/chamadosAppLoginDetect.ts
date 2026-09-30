/** Login vindo do site estático chamados.* (proxy Netlify ou browser direto). */
export function isChamadosAppLoginRequest(request: Request): boolean {
  if (request.headers.get("x-chamados-app-proxy") === "1") return true;
  if (request.headers.get("X-Chamados-App-Proxy") === "1") return true;

  const origin = (request.headers.get("origin") ?? "").toLowerCase();
  const referer = (request.headers.get("referer") ?? "").toLowerCase();
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();

  const needles = ["chamados.radioibiza", "chamados-radioibiza.netlify.app"];
  return needles.some((n) => origin.includes(n) || referer.includes(n) || host.includes(n));
}
