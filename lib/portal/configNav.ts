/** Submenu do módulo Configuração. */
export const CONFIG_NAV = [
  { href: "/config/parametros", label: "Parâmetros globais", short: "Parâm." },
  { href: "/config/usuarios", label: "Usuários e perfis", short: "Usuários" },
  { href: "/config/servidores", label: "Servidores", short: "Serv." },
  { href: "/config/integracoes", label: "Integrações", short: "Integr.", soon: true },
  { href: "/config/seguranca", label: "Segurança", short: "Seg.", soon: true },
  { href: "/config/logs", label: "Logs", short: "Logs" },
  { href: "/config/erros", label: "Erros", short: "Erros" },
] as const;

export const CONFIG_HOME_HREF = "/config/usuarios";
