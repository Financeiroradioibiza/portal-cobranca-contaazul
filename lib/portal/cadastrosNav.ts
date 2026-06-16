/** Sidebar do módulo Cadastros. */
export const CADASTROS_SIDEBAR = [
  { href: "/cadastros/grupos", label: "Rio × Produção", icon: "👥" },
  { href: "/cadastros/vinculos", label: "Lista vínculos", icon: "🔗" },
  { href: "/cadastros/prospects", label: "Prospects", icon: "🆕" },
  { href: "/cadastros/cliente-pdv-novo", label: "Cliente / PDV novo", icon: "📝" },
] as const;

/** Página principal ao clicar em Cadastros no topo. */
export const CADASTROS_HOME_HREF = "/cadastros/grupos";

/** @deprecated */
export const CADASTROS_NAV = CADASTROS_SIDEBAR.map((x) => ({
  href: x.href,
  label: x.label,
  short: x.label.split(" ")[0] ?? x.label,
}));
