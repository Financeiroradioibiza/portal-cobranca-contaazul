import { prisma } from "@/lib/prisma";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { listGatewayClientes } from "@/lib/criacao/publicarService";

export type PilotCheckStep = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type PilotCheckResult = {
  cloud2: boolean;
  yearMonth: number | null;
  gatewayClientes: number;
  steps: PilotCheckStep[];
  ready: boolean;
  testCliente: { portalClienteId: number; nome: string; email: string | null } | null;
};

async function collectRioPdvKeys(monthId: string): Promise<string[]> {
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId, movimento: { not: "saida" }, portalClienteId: { not: null } },
    select: {
      id: true,
      pdvs: { where: { movimento: { not: "saida" } }, select: { id: true } },
    },
  });
  const keys: string[] = [];
  for (const ln of linhas) {
    if (ln.pdvs.length === 0) keys.push(linhaAsPdvKey(ln.id));
    else keys.push(...ln.pdvs.map((p) => p.id));
  }
  return keys;
}

export async function runPlayerPilotCheck(): Promise<PilotCheckResult> {
  const steps: PilotCheckStep[] = [];
  const cloud2 = cloud2Enabled();

  steps.push({
    id: "cloud2",
    label: "Cloud2 configurado",
    ok: cloud2,
    detail: cloud2 ? "CLOUD2_BASE_URL + secret OK" : "Variáveis cloud2 ausentes",
  });

  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { yearMonth: true },
  });
  const ym = pickVigenteRioYearMonth(months, currentBrazilYearMonth());
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });

  const [linhasComId, logins, programacoesPublicadas, pdvsComId] = await Promise.all([
    month
      ? prisma.rioCompClienteLinha.count({
          where: { monthId: month.id, movimento: { not: "saida" }, portalClienteId: { not: null } },
        })
      : Promise.resolve(0),
    prisma.clientePlayerLogin.count({ where: { active: true } }),
    prisma.programacao.count({ where: { publicada: true } }),
    month
      ? prisma.rioCompPdv.count({
          where: {
            movimento: { not: "saida" },
            portalPdvId: { not: null },
            cliente: { monthId: month.id, movimento: { not: "saida" } },
          },
        })
      : Promise.resolve(0),
  ]);

  const rioKeys = month ? await collectRioPdvKeys(month.id) : [];
  const tokensOk =
    rioKeys.length === 0
      ? 0
      : await prisma.producaoPdvCadastro.count({
          where: { rioPdvKey: { in: rioKeys }, playerInstalacaoToken: { not: "" } },
        });

  steps.push({
    id: "ids",
    label: "IDs Player (clientes + PDVs)",
    ok: linhasComId > 0 && rioKeys.length > 0,
    detail: `${linhasComId} clientes · ${rioKeys.length} ponto(s) de instalação`,
  });

  steps.push({
    id: "logins",
    label: "Logins cliente gerados",
    ok: logins > 0,
    detail: `${logins} login(s) ativo(s)`,
  });

  steps.push({
    id: "tokens",
    label: "Chaves serial (instalação)",
    ok: rioKeys.length === 0 || tokensOk >= rioKeys.length,
    detail: `${tokensOk}/${rioKeys.length} com serial`,
  });

  steps.push({
    id: "programacao",
    label: "Programação publicada",
    ok: programacoesPublicadas > 0,
    detail:
      programacoesPublicadas > 0
        ? `${programacoesPublicadas} no portal (confirme sync no gateway)`
        : "Publique em Criação → Programações",
  });

  const avisosCount = await prisma.playerAvisoOperador.count();
  steps.push({
    id: "avisos_neon",
    label: "Avisos operador (Neon)",
    ok: true,
    detail: `${avisosCount} aviso(s) — endpoint /api/player-avisos no cloud2`,
  });

  let gatewayClientes = 0;
  if (cloud2) {
    try {
      gatewayClientes = (await listGatewayClientes()).length;
      steps.push({
        id: "gateway_sync",
        label: "Gateway cloud2 sincronizado",
        ok: gatewayClientes > 0,
        detail:
          gatewayClientes > 0
            ? `${gatewayClientes} cliente(s) no gateway`
            : "Clique «Sincronizar Player 5» em IDs Player",
      });
    } catch (e) {
      steps.push({
        id: "gateway_sync",
        label: "Gateway cloud2 sincronizado",
        ok: false,
        detail: e instanceof Error ? e.message : "falha ao consultar",
      });
    }
  }

  const firstLogin = await prisma.clientePlayerLogin.findFirst({
    where: { active: true },
    orderBy: { portalClienteId: "asc" },
    select: { portalClienteId: true, email: true, clienteNome: true },
  });

  const coreOk = steps.filter((s) => ["cloud2", "ids", "logins", "tokens", "gateway_sync"].includes(s.id)).every((s) => s.ok);

  return {
    cloud2,
    yearMonth: month ? ym : null,
    gatewayClientes,
    steps,
    ready: coreOk && programacoesPublicadas > 0,
    testCliente: firstLogin
      ? { portalClienteId: firstLogin.portalClienteId, nome: firstLogin.clienteNome, email: firstLogin.email }
      : null,
  };
}

/** Testa POST /api/login/ no webservice público (contrato Player 5). */
export async function probeWebserviceLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean; clienteId?: string; error?: string }> {
  if (!cloud2Enabled()) return { ok: false, error: "cloud2_desabilitado" };
  const base = process.env.CLOUD2_PUBLIC_URL?.replace(/\/$/, "") || "https://cloud2.radioibiza.app.br";
  try {
    const res = await fetch(`${base}/api/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password }),
    });
    const data = (await res.json()) as { mensagem?: string | string[] };
    if (Array.isArray(data.mensagem) && data.mensagem[0] === "valido") {
      return { ok: true, clienteId: String(data.mensagem[1]) };
    }
    return { ok: false, error: String(data.mensagem ?? "login_falhou") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rede" };
  }
}
