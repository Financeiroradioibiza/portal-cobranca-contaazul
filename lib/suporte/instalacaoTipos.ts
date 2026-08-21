import type { ElectronAuthModo, InstalacaoTipo } from "@/lib/suporte/instalacaoService";

export type { ElectronAuthModo };

export type InstalacaoTipoMeta = {
  id: InstalacaoTipo;
  label: string;
  desc: string;
};

export const INSTALACAO_TIPOS: InstalacaoTipoMeta[] = [
  {
    id: "padrao_cliente",
    label: "1 · Instalação Windows Web com login e senha administrativos (Somente para TI)",
    desc: "PWA no Chrome. O operador entra com e-mail e senha do cliente e escolhe o PDV na lista.",
  },
  {
    id: "pdv_login",
    label: "2 · Instalação Windows Web para um PDV sem senha",
    desc: "PWA no Chrome com o PDV embutido no link. O cliente entra com e-mail e senha — o PDV já vem selecionado.",
  },
  {
    id: "pdv_senha_temp",
    label: "3 - INSTALA WINDOWS - Instalacao em EDGE ou CHROME . Senha Temporaria.",
    desc: "PWA no Edge ou Chrome com PDV embutido + senha de uso único. Recomendado para a maioria das lojas.",
  },
  {
    id: "pdv_senha_temp_migracao",
    label: "4 - INSTALA WINDOWS + RETIRA PLAYER ANTIGO - Instalacao em EDGE ou CHROME . Senha Temporaria.",
    desc: "Igual ao tipo 3. Após instalar o Player 5, o cliente recebe passo para desinstalar a Rádio Ibiza antiga (.bat).",
  },
  {
    id: "pdv_play5",
    label: "5 · Instalação Android para Google Play",
    desc: "Código PL5 de uso único para o app na Play Store. Só gera com PDV sem player instalado (regenerar serial antes).",
  },
  {
    id: "electron_ti",
    label: "6 · Instalação Multisusuário Windows (Apenas para TI)",
    desc: "Instalador .exe (Electron) para PC compartilhado. Escolha abaixo: login e senha do cliente ou senha temporária.",
  },
];

/** Tipos visíveis no painel de instalação (1 e 2 ocultos por enquanto). */
export const INSTALACAO_TIPOS_VISIVEIS = INSTALACAO_TIPOS.filter((t) =>
  (
    [
      "pdv_senha_temp",
      "pdv_senha_temp_migracao",
      "pdv_play5",
      "electron_ti",
    ] as InstalacaoTipo[]
  ).includes(t.id),
);

export function instalacaoTipoLabel(tipo: string): string {
  if (tipo === "electron_ti") return "Electron multisusuário (TI)";
  if (tipo === "pdv_play5") return "Google Play (Android)";
  if (tipo === "pdv_login") return "Windows Web · PDV sem senha temp";
  if (tipo === "pdv_senha_temp") return "Windows Web · senha temporária";
  if (tipo === "pdv_senha_temp_migracao") return "Windows Web · atualização + remover antigo";
  return "Windows Web · login administrativo";
}

export function tipoUsaSenhaTemporaria(
  tipo: InstalacaoTipo,
  electronAuth?: ElectronAuthModo,
): boolean {
  if (tipo === "pdv_senha_temp" || tipo === "pdv_senha_temp_migracao") return true;
  if (tipo === "electron_ti") return electronAuth === "temp";
  return false;
}

export function tipoEhElectronTi(tipo: InstalacaoTipo): boolean {
  return tipo === "electron_ti";
}
