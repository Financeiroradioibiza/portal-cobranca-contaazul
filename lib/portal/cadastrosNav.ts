/** Sidebar do módulo Cadastros. */
export const CADASTROS_SIDEBAR = [
  { href: "/cadastros/vinculos", label: "Lista vínculos", icon: "🔗" },
] as const;

export const CADASTROS_HOME_HREF = "/cadastros/vinculos";

/** @deprecated */
export const CADASTROS_NAV = CADASTROS_SIDEBAR.map((x) => ({
  href: x.href,
  label: x.label,
  short: "Lista",
}));
