import { SiteClientesAdminPanel } from "@/components/suporte/SiteClientesAdminPanel";

export default function SuporteSiteClientesPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Site clientes</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Grupos de acesso, usuários e moodboard estratégico. O cliente acessa em{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/site-cliente/login</code>{" "}
            (somente leitura via cloud2).
          </p>
        </div>
      </header>
      <div className="portal-page-body">
        <SiteClientesAdminPanel />
      </div>
    </div>
  );
}
