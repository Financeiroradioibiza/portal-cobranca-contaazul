import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { normalizePortalEmail } from "@/lib/auth/users";
import { prisma } from "@/lib/prisma";
import { isPushConfigured } from "@/lib/push/vapid";

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: Request) {
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }
  const session = requirePortalSession(await getPortalSession());
  const email = normalizePortalEmail(session.email);
  if (!email.includes("@")) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim() ?? "";
  const p256dh = body.keys?.p256dh?.trim() ?? "";
  const auth = body.keys?.auth?.trim() ?? "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "missing_subscription_fields" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 400) ?? "";

  await prisma.portalPushSubscription.upsert({
    where: { endpoint },
    create: {
      userEmail: email,
      endpoint,
      p256dh,
      auth,
      userAgent,
    },
    update: {
      userEmail: email,
      p256dh,
      auth,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = requirePortalSession(await getPortalSession());
  const email = normalizePortalEmail(session.email);

  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim() ?? "";
  if (!endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }

  await prisma.portalPushSubscription.deleteMany({
    where: { endpoint, userEmail: email },
  });

  return NextResponse.json({ ok: true });
}
