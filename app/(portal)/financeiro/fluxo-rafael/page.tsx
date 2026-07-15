export default function FinanceiroFluxoRafaelPage() {
  return (
    <div className="portal-page min-h-full min-w-0" style={{ padding: 0 }}>
      <iframe
        src="/fluxo-rafael/app.html"
        title="Fluxo Rafael"
        className="w-full border-0 block"
        style={{ minHeight: "calc(100dvh - 3.5rem)" }}
      />
    </div>
  );
}
