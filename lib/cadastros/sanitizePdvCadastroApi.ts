import type { PortalSessionPayload } from "@/lib/auth/sessionToken";
import type { ProducaoPdvCadastroDto } from "@/lib/cadastros/producaoPdvCadastroService";

/** Token de instalação do player — só staff autorizado (Suporte / Produção / master). */
function maySeeInstalacaoToken(session: PortalSessionPayload): boolean {
  if (session.roles.includes("master")) return true;
  return session.roles.includes("suporte") || session.roles.includes("producao");
}

export function sanitizePdvCadastroForApi(
  cadastro: ProducaoPdvCadastroDto,
  session: PortalSessionPayload,
): ProducaoPdvCadastroDto {
  if (maySeeInstalacaoToken(session)) return cadastro;
  const { playerInstalacaoToken: _omit, ...rest } = cadastro;
  return { ...rest, playerInstalacaoToken: "" };
}
