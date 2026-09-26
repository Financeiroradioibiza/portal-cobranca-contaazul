/**
 * Recuperação one-shot: linha Rio + PDV Mall (Shopping Park Europeu) com player 326.001 já instalado.
 * Uso: npx tsx scripts/recover-shopping-park-europeu-mall.ts
 */
import { Prisma } from "@prisma/client";
import { PRODUCAO_CATALOGO_LAYOUT_YM } from "@/lib/cadastros/producaoCatalogo";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { searchPeopleByText } from "@/lib/contaazul/personBilling";
import { normalizeBrazilianTaxIdForStorage, onlyDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { applyCaPersonToRioLinha } from "@/lib/rio/rioCaPersonLink";
import { scheduleProducaoSuporteEspelhoPatch } from "@/lib/cadastros/producaoSuporteEspelhoService";

const RIO_YM = 202606;
const RIO_PDV_KEY = "cmsz4b8x5000lwqe9g3k1o7lo";
const PORTAL_CLIENTE_ID = 326;
const PORTAL_PDV_ID = 326001;
const DOCUMENTO = "11.096.279/0001-75";
const EMAIL_COBRANCA =
  "emanuelle.magalhaes@shoppingparkeuropeu.com.br; gabriela.bettencourt@shoppingparkeuropeu.com.br; marketingspe@shoppingparkeuropeu.com.br";

async function main() {
  const existingPdv = await prisma.rioCompPdv.findUnique({ where: { id: RIO_PDV_KEY } });
  if (existingPdv) {
    console.log("PDV Rio já existe — nada a fazer.", existingPdv);
    return;
  }

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: RIO_YM },
    include: { grupos: true },
  });
  if (!month) throw new Error("month_not_found");
  if (month.closedAt) throw new Error("month_closed");

  const caEntrada = month.grupos.find((g) => g.systemTag === "ca_entrada");
  if (!caEntrada) throw new Error("ca_entrada_grupo_missing");

  const cadastro = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey: RIO_PDV_KEY },
  });
  if (!cadastro) throw new Error("producao_cadastro_missing");

  const maxSort = await prisma.rioCompClienteLinha.aggregate({
    where: { monthId: month.id, rioGrupoId: caEntrada.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const documento = normalizeBrazilianTaxIdForStorage(DOCUMENTO) ?? DOCUMENTO;

  const { linhaId } = await prisma.$transaction(async (tx) => {
    const linha = await tx.rioCompClienteLinha.create({
      data: {
        monthId: month.id,
        rioGrupoId: caEntrada.id,
        caPersonId: "pending-recover",
        grupoSite: "",
        nomeFantasia: "Shopping Park Europeu",
        razaoSocial: "SHOPPING PARK EUROPEU S/A",
        documento,
        emailCobranca: EMAIL_COBRANCA,
        numeroPdvSite: 1,
        categoriaSite: "Shopping",
        movimento: "entrada",
        tagCobranca: "cobrando",
        sortOrder,
        portalClienteId: PORTAL_CLIENTE_ID,
      },
    });

    await tx.rioCompClienteLinha.update({
      where: { id: linha.id },
      data: { caPersonId: `import:unlinked:${linha.id}` },
    });

    await tx.rioCompPdv.create({
      data: {
        id: RIO_PDV_KEY,
        clienteId: linha.id,
        nome: "Shopping Park Europeu - Mall",
        documento,
        movimento: "estavel",
        tagCobranca: "cobrando",
        sortOrder: 0,
        portalPdvId: PORTAL_PDV_ID,
      },
    });

    const layout = await tx.cadastroProducaoLayout.findUnique({
      where: { yearMonth: PRODUCAO_CATALOGO_LAYOUT_YM },
    });
    const bucketIds = {
      ...((layout?.portalClienteIdsByBucketKey as Record<string, number> | null) ?? {}),
    };
    const pdvIds = {
      ...((layout?.portalPdvIdsByRioPdvKey as Record<string, number> | null) ?? {}),
    };
    bucketIds[linha.id] = PORTAL_CLIENTE_ID;
    pdvIds[RIO_PDV_KEY] = PORTAL_PDV_ID;

    await tx.cadastroProducaoLayout.upsert({
      where: { yearMonth: PRODUCAO_CATALOGO_LAYOUT_YM },
      create: {
        yearMonth: PRODUCAO_CATALOGO_LAYOUT_YM,
        portalClienteIdsByBucketKey: bucketIds as Prisma.InputJsonValue,
        portalPdvIdsByRioPdvKey: pdvIds as Prisma.InputJsonValue,
      },
      update: {
        portalClienteIdsByBucketKey: bucketIds as Prisma.InputJsonValue,
        portalPdvIdsByRioPdvKey: pdvIds as Prisma.InputJsonValue,
      },
    });

    return { linhaId: linha.id };
  });

  const token = await getValidAccessToken();
  if (token) {
    const digits = onlyDigits(documento);
    const hits = await searchPeopleByText(token, digits);
    if (hits.length === 1) {
      await applyCaPersonToRioLinha(linhaId, month.id, hits[0]!.id, token, {
        caNomeLista: "Shopping Park Europeu",
      });
      console.log("Vinculado Conta Azul:", hits[0]!.id, hits[0]!.nome);
    } else {
      console.warn("CA: vínculo manual necessário (hits=", hits.length, ")");
    }
  } else {
    console.warn("Sem token CA — linha criada; vincule CA na planilha.");
  }

  scheduleProducaoSuporteEspelhoPatch(RIO_PDV_KEY);

  console.log("OK", {
    linhaId,
    rioPdvKey: RIO_PDV_KEY,
    portalClienteId: PORTAL_CLIENTE_ID,
    portalPdvId: PORTAL_PDV_ID,
    cadastroToken: cadastro.playerInstalacaoToken?.slice(0, 8) + "…",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
