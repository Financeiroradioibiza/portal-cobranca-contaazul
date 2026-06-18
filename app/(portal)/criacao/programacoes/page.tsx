export default function CriacaoProgramacoesPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Criação</div>
          <h1 className="portal-page-title">Programações</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <p style={{ color: "var(--ri-text-on-light-4)", fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>
          Cada programação é amarrada a um cliente/PDV e contém uma ou mais pastas (playlists).
          Em construção (Fase 1).
        </p>
      </div>
    </div>
  );
}
