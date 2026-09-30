import "server-only";

function chamadosAppOrigin(): string {
  const app =
    process.env.NEXT_PUBLIC_CHAMADOS_APP_URL?.trim() ||
    process.env.CHAMADOS_APP_PUBLIC_ORIGIN?.trim() ||
    "https://chamados.radioibiza.app.br";
  return app.replace(/\/$/, "");
}

/** Deep link app Chamados (site separado). */
export function chamadosMobilePushUrl(query?: { conversa?: string }): string {
  const base = `${chamadosAppOrigin()}/`;
  if (query?.conversa?.trim()) {
    const qs = new URLSearchParams({
      view: "chat",
      conversa: query.conversa.trim(),
    });
    return `${base}?${qs.toString()}`;
  }
  return base;
}
