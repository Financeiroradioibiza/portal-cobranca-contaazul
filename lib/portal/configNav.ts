/** Submenu do módulo Configuração. */
export const CONFIG_NAV = [
  { href: "/config/parametros", label: "Parâmetros globais", short: "Parâm.", soon: true },
  { href: "/config/usuarios", label: "Usuários e perfis", short: "Usuários" },
  { href: "/config/integracoes", label: "Integrações", short: "Integr.", soon: true },
  { href: "/config/seguranca", label: "Segurança", short: "Seg.", soon: true },
  { href: "/config/logs", label: "Logs", short: "Logs" },
] as const;

export const CONFIG_HOME_HREF = "/config/usuarios";
