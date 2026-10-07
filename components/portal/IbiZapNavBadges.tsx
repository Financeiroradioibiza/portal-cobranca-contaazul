import type { ChamadosResumoView } from "@/lib/chamados/chamadoTypes";

type Props = {
  resumo: ChamadosResumoView;
  /** Bolinhas no topnav; pills com número no submenu IbiZap. */
  mode?: "dots" | "pills";
};

/** Indicadores vermelho (chamados / @) e azul (conversas) — mesmo critério da sidebar IbiZap. */
export function IbiZapNavBadges({ resumo, mode = "dots" }: Props) {
  const chamados = resumo.chamadosNaoLidos ?? 0;
  const conversas = resumo.conversasNaoLidas ?? 0;
  const mencoes = resumo.conversasMencoes ?? 0;

  const showRedChamados = chamados > 0;
  const showRedMencoes = mencoes > 0;
  const showBlue = conversas > 0;

  if (!showRedChamados && !showRedMencoes && !showBlue) return null;

  if (mode === "pills") {
    return (
      <span className="portal-sidebar-chamados-badges">
        {showRedMencoes ?
          <span
            className="portal-sidebar-chamados-badge portal-sidebar-chamados-badge-red"
            aria-label={`${mencoes} menção(ões)`}
            title="Menções @"
          >
            {mencoes > 99 ? "99+" : mencoes === 1 ? "@" : mencoes}
          </span>
        : null}
        {showBlue ?
          <span
            className="portal-sidebar-chamados-badge portal-sidebar-chamados-badge-blue"
            aria-label={`${conversas} mensagem(ns) não lida(s)`}
            title="Mensagens não lidas"
          >
            {conversas > 99 ? "99+" : conversas}
          </span>
        : null}
        {showRedChamados ?
          <span
            className="portal-sidebar-chamados-badge portal-sidebar-chamados-badge-red"
            aria-label={`${chamados} chamado(s) não lido(s)`}
            title="Chamados não lidos"
          >
            {chamados > 99 ? "99+" : chamados}
          </span>
        : null}
      </span>
    );
  }

  const ariaParts: string[] = [];
  if (showRedChamados) ariaParts.push(`${chamados} chamado(s) não lido(s)`);
  if (showRedMencoes) ariaParts.push(`${mencoes} menção(ões)`);
  if (showBlue) ariaParts.push(`${conversas} conversa(s) não lida(s)`);

  return (
    <span className="portal-topnav-ibizap-dots" aria-label={ariaParts.join("; ")}>
      {(showRedChamados || showRedMencoes) ?
        <span
          className="portal-topnav-ibizap-dot portal-topnav-ibizap-dot--red"
          title={
            showRedMencoes && showRedChamados ?
              `Chamados (${chamados}) e menções (${mencoes})`
            : showRedMencoes ?
              `${mencoes} menção(ões)`
            : `${chamados} chamado(s) não lido(s)`
          }
        />
      : null}
      {showBlue ?
        <span
          className="portal-topnav-ibizap-dot portal-topnav-ibizap-dot--blue"
          title={`${conversas} mensagem(ns) não lida(s)`}
        />
      : null}
    </span>
  );
}
