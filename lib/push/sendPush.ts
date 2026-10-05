import "server-only";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { getVapidConfig } from "@/lib/push/vapid";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** Padrão de vibração no SW do PWA chamados. */
  alarm?: boolean;
  silent?: boolean;
};

export async function sendPushToEmails(emails: string[], payload: PushPayload): Promise<void> {
  const vapid = getVapidConfig();
  if (!vapid) return;

  const normalized = [
    ...new Set(emails.map((e) => normalizePortalEmail(e)).filter((e) => e.includes("@"))),
  ];
  if (normalized.length === 0) return;

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const subs = await prisma.portalPushSubscription.findMany({
    where: { userEmail: { in: normalized } },
  });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        data,
      );
    } catch (e: unknown) {
      const status =
        e && typeof e === "object" && "statusCode" in e ?
          Number((e as { statusCode?: number }).statusCode)
        : 0;
      if (status === 404 || status === 410) {
        await prisma.portalPushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error("[push] falha envio", sub.userEmail, sub.endpoint.slice(0, 48), e);
      }
    }
  }
}
