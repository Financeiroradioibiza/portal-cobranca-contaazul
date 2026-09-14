import { NextResponse, after } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  applyLojaCadastroConciliacao,
  type LojaConciliarAlvo,
} from "@/lib/player/playerIngestService";

export const runtime = "nodejs";

function scheduleGatewaySyncForPdv(rioPdvKey: string) {
  after(async () => {
    try {
      const { cloud2Enabled } = await import("@/lib/criacao/cloud2Client");
      if (!cloud2Enabled()) return;
      const {
        resolvePortalPdvIdFromRioPdvKey,
        syncPlayerGatewayRegistryForPdvIds,
      } = await import("@/lib/player/playerGatewaySync");
      const portalPdvId = await resolvePortalPdvIdFromRioPdvKey(rioPdvKey);
      if (!portalPdvId) return;
      await syncPlayerGatewayRegistryForPdvIds([portalPdvId]);
    } catch (e) {
      console.error("[migracao/contato-loja PATCH] sync gateway falhou", { rioPdvKey, err: e });
    }
  });
}

function parseLojaAlvo(raw: unknown): LojaConciliarAlvo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tipo = o.tipo;
  if (tipo === "principal") return { tipo: "principal" };
  if (tipo === "novo_extra") return { tipo: "novo_extra" };
  if (tipo === "extra" && typeof o.extraId === "string" && o.extraId.trim()) {
    return { tipo: "extra", extraId: o.extraId.trim() };
  }
  return null;
}

const ERROR_PT: Record<string, string> = {
  payload_vazio: "Informe ao menos nome, e-mail ou telefone.",
  contato_ja_e_principal: "Esse contato já é o gerente principal.",
  contato_extra_duplicado: "Já existe um contato extra igual.",
  contato_extra_nao_encontrado: "Contato extra não encontrado.",
};

export async function PATCH(req: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await req.json()) as {
      rioPdvKey?: string;
      lojaAlvo?: unknown;
      contatoLojaNome?: string;
      contatoLojaEmail?: string;
      contatoLojaTelefone?: string;
    };

    const rioPdvKey = String(body.rioPdvKey ?? "").trim();
    if (!rioPdvKey) {
      return NextResponse.json({ ok: false, error: "rio_pdv_key_obrigatorio" }, { status: 400 });
    }

    const lojaAlvo = parseLojaAlvo(body.lojaAlvo);
    if (!lojaAlvo) {
      return NextResponse.json({ ok: false, error: "loja_alvo_invalido" }, { status: 400 });
    }

    const patch = {
      contatoLojaNome: String(body.contatoLojaNome ?? "").trim(),
      contatoLojaEmail: String(body.contatoLojaEmail ?? "").trim(),
      contatoLojaTelefone: String(body.contatoLojaTelefone ?? "").trim(),
    };

    await applyLojaCadastroConciliacao(rioPdvKey, patch, lojaAlvo);
    scheduleGatewaySyncForPdv(rioPdvKey);

    void import("@/lib/cadastros/producaoSuporteEspelhoService").then(({ scheduleProducaoSuporteEspelhoPatch }) => {
      scheduleProducaoSuporteEspelhoPatch(rioPdvKey);
    });

    const { getOrCreatePdvCadastro } = await import("@/lib/cadastros/producaoPdvCadastroService");
    const { listContatosLojaResumo } = await import("@/lib/cadastros/contatosLojaExtras");
    const cad = await getOrCreatePdvCadastro(rioPdvKey, { refreshCobranca: false });

    return NextResponse.json({
      ok: true,
      rioPdvKey,
      pdvNome: cad.nome.trim() || rioPdvKey,
      contatos: listContatosLojaResumo(
        {
          nome: cad.contatoLojaNome,
          email: cad.contatoLojaEmail,
          telefone: cad.contatoLojaTelefone,
        },
        cad.contatosLojaExtras,
      ),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const code = e instanceof Error ? e.message : "server_error";
    console.error("[suporte/migracao/contato-loja PATCH]", e);
    return NextResponse.json(
      {
        ok: false,
        error: code,
        message: ERROR_PT[code] ?? "Não foi possível salvar o contato.",
      },
      { status: code === "payload_vazio" ? 400 : 500 },
    );
  }
}
