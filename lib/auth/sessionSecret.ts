/**
 * Lê PORTAL_SESSION_SECRET em runtime.
 * Acesso dinâmico evita que o bundler do middleware (Netlify/Next) congele
 * um valor de build diferente do runtime das serverless functions.
 */
export function readPortalSessionSecret(): string {
  const key = "PORTAL_" + "SESSION_SECRET";
  return process.env[key]?.trim() ?? "";
}
