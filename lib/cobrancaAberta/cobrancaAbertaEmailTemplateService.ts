import { prisma } from "@/lib/prisma";
import { defaultCobrancaAbertaTemplateSeed } from "@/lib/cobrancaAberta/cobrancaAbertaEmailDefaults";

export async function getOrCreateCobrancaAbertaEmailTemplate() {
  const id = defaultCobrancaAbertaTemplateSeed().id;
  let row = await prisma.cobrancaAbertaEmailTemplate.findUnique({ where: { id } });
  if (!row) {
    const seed = defaultCobrancaAbertaTemplateSeed();
    row = await prisma.cobrancaAbertaEmailTemplate.create({
      data: {
        id: seed.id,
        subject: seed.subject,
        bodyText: seed.bodyText,
      },
    });
  }
  return row;
}
