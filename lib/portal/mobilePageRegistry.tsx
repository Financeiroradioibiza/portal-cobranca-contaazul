import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ProducaoDashboardPanel } from "@/components/producao/ProducaoDashboardPanel";
import { ProducaoSuportePanel } from "@/components/producao/ProducaoSuportePanel";
import { ClientesRelacionamentoPanel } from "@/components/clientes/ClientesRelacionamentoPanel";
import { LikesPanel } from "@/components/clientes/LikesPanel";
import { MusicBoardPanel } from "@/components/musicboard/MusicBoardPanel";
import { FinanceiroVisaoGeralPanel } from "@/components/financeiro/FinanceiroVisaoGeralPanel";
import { RioClientesCompPanel } from "@/components/RioClientesCompPanel";
import { CobrancaDashboard } from "@/components/CobrancaDashboard";
import { EnviosManuaisEmbedPanel } from "@/components/financeiro/EnviosManuaisEmbedPanel";
import { ManualEnviosPanel } from "@/components/ManualEnviosPanel";
import { ConsultaPainelPage } from "@/components/ConsultaPainelPage";
import { FinanceiroDiarioPanel } from "@/components/financeiro/FinanceiroDiarioPanel";
import { CadastrosGruposPanel } from "@/components/cadastros/CadastrosGruposPanel";
import { PortalPlayerIdsPanel } from "@/components/cadastros/PortalPlayerIdsPanel";
import { PrimeiroPingPanel } from "@/components/cadastros/PrimeiroPingPanel";
import { AtualizacoesCadastroPanel } from "@/components/cadastros/AtualizacoesCadastroPanel";
import { ProspectsBoard } from "@/components/cadastros/ProspectsBoard";
import { SolicitarPdvPanel } from "@/components/cadastros/SolicitarPdvPanel";
import { CriadorPanel } from "@/components/criacao/CriadorPanel";
import { BibliotecaMusicalShell } from "@/components/criacao/BibliotecaMusicalShell";
import { ProgramacoesPanel } from "@/components/criacao/ProgramacoesPanel";
import { AtlCricaPanel } from "@/components/criacao/AtlCricaPanel";
import { EdicaoPanel } from "@/components/criacao/EdicaoPanel";
import { PastasEspeciaisPanel } from "@/components/criacao/PastasEspeciaisPanel";
import { CriacaoRelatoriosPanel } from "@/components/criacao/CriacaoRelatoriosPanel";
import { AtualizacoesPanel } from "@/components/criacao/AtualizacoesPanel";
import { UploadPanel } from "@/components/criacao/UploadPanel";
import { FilaPanel } from "@/components/criacao/FilaPanel";
import { DownloadLinkPanel } from "@/components/criacao/DownloadLinkPanel";
import { VinhetasPanel } from "@/components/criacao/VinhetasPanel";
import { CriacaoErrorLogPanel } from "@/components/criacao/CriacaoErrorLogPanel";
import { WizardPanel } from "@/components/criacao/WizardPanel";
import { CheckPanel } from "@/components/criacao/CheckPanel";
import { ExplicitoPanel } from "@/components/criacao/ExplicitoPanel";
import { LoginsClientesPanel } from "@/components/suporte/LoginsClientesPanel";
import { SiteClientesAdminPanel } from "@/components/suporte/SiteClientesAdminPanel";
import { PlayerAvisosPanel } from "@/components/suporte/PlayerAvisosPanel";
import { InstalacaoPanel } from "@/components/suporte/InstalacaoPanel";
import { ChamadosBoard } from "@/components/chamados/ChamadosBoard";
import { ConfigParametrosPanel } from "@/components/config/ConfigParametrosPanel";
import { ConfigUsuariosPanel } from "@/components/config/ConfigUsuariosPanel";
import { ConfigServidoresPanel } from "@/components/config/ConfigServidoresPanel";
import { ConfigLogsPanel } from "@/components/config/ConfigLogsPanel";
import { ConfigErrorLogPanel } from "@/components/config/ConfigErrorLogPanel";
import { CADASTROS_HOME_HREF } from "@/lib/portal/cadastrosNav";
import { CONFIG_HOME_HREF } from "@/lib/portal/configNav";
import { siteClientePublicLoginUrl } from "@/lib/site-cliente/publicOrigin";
import { stripMobilePortalPrefix, toMobilePortalPath } from "@/lib/portal/mobilePaths";

export type MobilePortalPageMeta = {
  section: string;
  title: string;
  description?: string;
  criacao?: boolean;
  suspense?: boolean;
};

export type MobilePortalPageResolved = MobilePortalPageMeta & {
  content: ReactNode;
};

function withSuspense(node: ReactNode, enabled?: boolean): ReactNode {
  if (!enabled) return node;
  return (
    <Suspense fallback={<p className="px-1 py-8 text-center text-sm text-slate-500">Carregando…</p>}>
      {node}
    </Suspense>
  );
}

type PageDef = MobilePortalPageMeta & {
  render: () => ReactNode;
};

const PAGES: Record<string, PageDef> = {
  "/": {
    section: "Dashboard",
    title: "Visão geral",
    render: () => <ProducaoDashboardPanel />,
  },
  "/clientes": {
    section: "Dashboard",
    title: "Clientes",
    suspense: true,
    render: () => <ClientesRelacionamentoPanel />,
  },
  "/clientes/likes": {
    section: "Dashboard",
    title: "Likes",
    suspense: true,
    render: () => <LikesPanel />,
  },
  "/musicboard": {
    section: "Dashboard",
    title: "MusicBoard",
    suspense: true,
    render: () => <MusicBoardPanel />,
  },
  "/financeiro/visao-geral": {
    section: "Financeiro",
    title: "Visão geral",
    render: () => <FinanceiroVisaoGeralPanel />,
  },
  "/financeiro/planilha-rio": {
    section: "Financeiro",
    title: "Planilha Rio",
    render: () => <RioClientesCompPanel />,
  },
  "/financeiro/vencidos": {
    section: "Financeiro",
    title: "Vencidos",
    render: () => <CobrancaDashboard />,
  },
  "/financeiro/envios-manuais": {
    section: "Financeiro",
    title: "Envios manuais",
    render: () => <EnviosManuaisEmbedPanel />,
  },
  "/financeiro/envios-oc": {
    section: "Financeiro",
    title: "Envios OC",
    render: () => <ManualEnviosPanel />,
  },
  "/financeiro/consulta-painel": {
    section: "Financeiro",
    title: "Consulta painel",
    render: () => <ConsultaPainelPage />,
  },
  "/financeiro/diario": {
    section: "Financeiro",
    title: "Diário",
    render: () => <FinanceiroDiarioPanel />,
  },
  "/financeiro/fluxo-rafael": {
    section: "Financeiro",
    title: "Fluxo Rafael",
    render: () => (
      <iframe
        src="/fluxo-rafael/app.html"
        title="Fluxo Rafael"
        className="block h-[calc(100dvh-11rem)] w-full rounded-lg border border-slate-200 dark:border-slate-700"
      />
    ),
  },
  "/cadastros/grupos": {
    section: "Cadastros",
    title: "Rio × Produção",
    render: () => <CadastrosGruposPanel />,
  },
  "/cadastros/vinculos": {
    section: "Cadastros",
    title: "IDs Player",
    render: () => <PortalPlayerIdsPanel />,
  },
  "/cadastros/primeiro-ping": {
    section: "Cadastros",
    title: "Primeiro ping",
    render: () => <PrimeiroPingPanel />,
  },
  "/cadastros/atualizacoes": {
    section: "Cadastros",
    title: "Atl. cadastros",
    render: () => <AtualizacoesCadastroPanel />,
  },
  "/cadastros/prospects": {
    section: "Cadastros",
    title: "Prospects",
    render: () => <ProspectsBoard />,
  },
  "/cadastros/solicitar-pdv": {
    section: "Cadastros",
    title: "Cadastrar PDV",
    render: () => <SolicitarPdvPanel />,
  },
  "/criacao/criador": {
    section: "Criação",
    title: "Criador",
    criacao: true,
    render: () => <CriadorPanel />,
  },
  "/criacao/biblioteca": {
    section: "Criação",
    title: "Biblioteca musical",
    criacao: true,
    render: () => <BibliotecaMusicalShell />,
  },
  "/criacao/programacoes": {
    section: "Criação",
    title: "Programações",
    criacao: true,
    render: () => <ProgramacoesPanel />,
  },
  "/criacao/atl-crica": {
    section: "Criação",
    title: "ATL Crica",
    criacao: true,
    render: () => <AtlCricaPanel />,
  },
  "/criacao/edicao": {
    section: "Criação",
    title: "Edição de música",
    criacao: true,
    render: () => <EdicaoPanel />,
  },
  "/criacao/pastas-especiais": {
    section: "Criação",
    title: "Pastas Especiais",
    criacao: true,
    render: () => <PastasEspeciaisPanel />,
  },
  "/criacao/relatorios": {
    section: "Criação",
    title: "Relatórios",
    criacao: true,
    render: () => <CriacaoRelatoriosPanel />,
  },
  "/criacao/atualizacoes": {
    section: "Criação",
    title: "Produção",
    criacao: true,
    render: () => <AtualizacoesPanel />,
  },
  "/criacao/upload": {
    section: "Criação",
    title: "Upload",
    criacao: true,
    suspense: true,
    render: () => <UploadPanel />,
  },
  "/criacao/fila": {
    section: "Criação",
    title: "Fila de processamento",
    criacao: true,
    render: () => <FilaPanel />,
  },
  "/criacao/download": {
    section: "Criação",
    title: "Download link",
    criacao: true,
    render: () => <DownloadLinkPanel />,
  },
  "/criacao/vinhetas": {
    section: "Criação",
    title: "Vinhetas",
    criacao: true,
    render: () => <VinhetasPanel />,
  },
  "/criacao/erros": {
    section: "Criação",
    title: "Diagnóstico",
    criacao: true,
    render: () => <CriacaoErrorLogPanel />,
  },
  "/criacao/wizard": {
    section: "Criação",
    title: "Wizard IA",
    criacao: true,
    render: () => <WizardPanel />,
  },
  "/criacao/check": {
    section: "Criação",
    title: "CHECK",
    criacao: true,
    render: () => <CheckPanel />,
  },
  "/criacao/explicito": {
    section: "Criação",
    title: "EXPLICITO!",
    criacao: true,
    render: () => <ExplicitoPanel />,
  },
  "/suporte": {
    section: "Suporte",
    title: "Central de suporte",
    render: () => <ProducaoSuportePanel />,
  },
  "/suporte/logins-clientes": {
    section: "Suporte",
    title: "Logins clientes",
    render: () => <LoginsClientesPanel />,
  },
  "/suporte/site-clientes": {
    section: "Suporte",
    title: "Site clientes",
    description: "Grupos de acesso e usuários do site clientes.",
    render: () => (
      <SiteClientesAdminPanel
        siteClienteLoginUrl={siteClientePublicLoginUrl(process.env.NEXT_PUBLIC_SITE_URL)}
      />
    ),
  },
  "/suporte/avisos-player": {
    section: "Suporte",
    title: "Avisos player",
    render: () => <PlayerAvisosPanel />,
  },
  "/suporte/instalacao": {
    section: "Suporte",
    title: "Instalação",
    render: () => <InstalacaoPanel />,
  },
  "/chamados": {
    section: "Chamados",
    title: "Quadro kanban",
    render: () => <ChamadosBoard />,
  },
  "/config/parametros": {
    section: "Configuração",
    title: "Parâmetros",
    render: () => <ConfigParametrosPanel />,
  },
  "/config/usuarios": {
    section: "Configuração",
    title: "Usuários",
    render: () => <ConfigUsuariosPanel />,
  },
  "/config/servidores": {
    section: "Configuração",
    title: "Servidores",
    render: () => <ConfigServidoresPanel />,
  },
  "/config/logs": {
    section: "Configuração",
    title: "Logs",
    render: () => <ConfigLogsPanel />,
  },
  "/config/erros": {
    section: "Configuração",
    title: "Erros",
    render: () => <ConfigErrorLogPanel />,
  },
};

const REDIRECTS: Record<string, string> = {
  "/cadastros": CADASTROS_HOME_HREF,
  "/config": CONFIG_HOME_HREF,
  "/cadastros/cliente-pdv-novo": "/cadastros/solicitar-pdv",
};

export function desktopPathFromSegments(segments?: string[]): string {
  if (!segments || segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

export function resolveMobilePortalPage(segments?: string[]): MobilePortalPageResolved | null {
  const desktopPath = desktopPathFromSegments(segments);
  const redirectTo = REDIRECTS[desktopPath];
  if (redirectTo) {
    redirect(toMobilePortalPath(redirectTo));
  }

  const def = PAGES[desktopPath];
  if (!def) return null;

  const { render, suspense, ...meta } = def;
  return {
    ...meta,
    content: withSuspense(render(), suspense),
  };
}

export function normalizeMobilePathname(pathname: string): string {
  return stripMobilePortalPrefix(pathname);
}
