/** Prefixo da visualização mobile do portal staff (não confundir com /m/site-cliente). */
export const PORTAL_MOBILE_BASE = "/m";

const DESKTOP_PORTAL_PREFIXES = [
  "/financeiro",
  "/cadastros",
  "/criacao",
  "/suporte",
  "/chamados",
  "/config",
  "/clientes",
  "/musicboard",
  "/producao",
] as const;

export function isDesktopPortalPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === "/") return true;
  return DESKTOP_PORTAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Rota /m/* do portal staff (exclui /m/site-cliente). */
export function isPortalMobileStaffPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === PORTAL_MOBILE_BASE) return true;
  if (!path.startsWith(`${PORTAL_MOBILE_BASE}/`)) return false;
  return !path.startsWith(`${PORTAL_MOBILE_BASE}/site-cliente`);
}

export function stripMobilePortalPrefix(pathname: string): string {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === PORTAL_MOBILE_BASE) return "/";
  if (path.startsWith(`${PORTAL_MOBILE_BASE}/`)) {
    const rest = path.slice(PORTAL_MOBILE_BASE.length);
    return rest || "/";
  }
  return path;
}

export function toMobilePortalPath(desktopPath: string): string {
  const path = desktopPath.split("?")[0] ?? desktopPath;
  if (path === "/") return PORTAL_MOBILE_BASE;
  return `${PORTAL_MOBILE_BASE}${path}`;
}

export function toMobilePortalHref(href: string): string {
  const [path, query] = href.split("?");
  const mobile = toMobilePortalPath(path ?? href);
  return query ? `${mobile}?${query}` : mobile;
}

export function toDesktopPortalPath(mobilePathname: string): string {
  return stripMobilePortalPrefix(mobilePathname);
}
