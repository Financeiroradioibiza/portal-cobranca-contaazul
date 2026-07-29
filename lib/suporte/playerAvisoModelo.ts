/** Tipos de aviso operador no Player 5. */
export type PlayerAvisoModelo = "manual" | "cadastro_loja" | "cadastro_financeiro";

export const PLAYER_AVISO_MODELOS_AUTOMATIZADOS = [
  "cadastro_loja",
  "cadastro_financeiro",
] as const satisfies readonly PlayerAvisoModelo[];

export type PlayerAvisoModeloAutomatizado = (typeof PLAYER_AVISO_MODELOS_AUTOMATIZADOS)[number];

export function isPlayerAvisoModeloAutomatizado(
  modelo: string,
): modelo is PlayerAvisoModeloAutomatizado {
  return (
    modelo === "cadastro_loja" || modelo === "cadastro_financeiro"
  );
}

export function parsePlayerAvisoModelo(raw: unknown): PlayerAvisoModelo {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "cadastro_loja" || s === "cadastro_financeiro") return s;
  return "manual";
}

export const MENSAGEM_PADRAO_AVISO_CADASTRO_LOJA =
  "Favor atualize o cadastro da loja para entrar no player.";

export const MENSAGEM_PADRAO_AVISO_CADASTRO_FINANCEIRO =
  "Favor atualize o cadastro do financeiro para entrar no player.";

export function mensagemPadraoAvisoModelo(modelo: PlayerAvisoModeloAutomatizado): string {
  if (modelo === "cadastro_financeiro") return MENSAGEM_PADRAO_AVISO_CADASTRO_FINANCEIRO;
  return MENSAGEM_PADRAO_AVISO_CADASTRO_LOJA;
}

export function rotuloAvisoModelo(modelo: PlayerAvisoModelo): string {
  if (modelo === "cadastro_loja") return "Automatizado · Cadastro loja";
  if (modelo === "cadastro_financeiro") return "Automatizado · Cadastro financeiro";
  return "Manual";
}
