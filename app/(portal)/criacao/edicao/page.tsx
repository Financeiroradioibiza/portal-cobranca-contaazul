export default function CriacaoEdicaoPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Criação</div>
          <h1 className="portal-page-title">Edição de música</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <p style={{ color: "var(--ri-text-on-light-4)", fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>
          Onde o criativo dá um &quot;tapa&quot; em faixas já processadas: abrir uma programação, ver o
          ponto de mix detectado automaticamente (segundos finais do crossfade) e ajustar, além de
          aplicar trim (cortar trechos). O ponto de mix é da faixa canônica e vale para todos os
          clientes que a tocam. Em construção (Fase 1).
        </p>
      </div>
    </div>
  );
}
