import { prisma } from "@/lib/prisma";
import {
  defaultTemplateSeed,
  LEGACY_OC_EMAIL_BODY_V1,
  OC_EMAIL_DEFAULT_BODY,
} from "@/lib/manualReminders/ocEmailDefaults";

const TEMPLATE_ID = "default";

function normBody(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

export async function getOrCreateOcEmailTemplate() {
  let row = await prisma.ocEmailTemplate.findUnique({ where: { id: TEMPLATE_ID } });
  if (!row) {
    const seed = defaultTemplateSeed();
    row = await prisma.ocEmailTemplate.create({
      data: {
        id: seed.id,
        subject: seed.subject,
        bodyText: seed.bodyText,
      },
    });
    return row;
  }

  if (normBody(row.bodyText) === normBody(LEGACY_OC_EMAIL_BODY_V1)) {
    row = await prisma.ocEmailTemplate.update({
      where: { id: TEMPLATE_ID },
      data: { bodyText: OC_EMAIL_DEFAULT_BODY },
    });
  }

  return row;
}
