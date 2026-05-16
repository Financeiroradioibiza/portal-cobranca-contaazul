import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_NOTE = 5000;
const MAX_CLIENT_ID_LEN = 128;

/** Id de cliente Conta Azul (UUID ou similar) — evita path injection. */
function validClientId(id: string): boolean {
  if (!id || id.length > MAX_CLIENT_ID_LEN) return false;
  if (/[\s/\\]/.test(id)) return false;
  return true;
}

/**
 * PATCH body: { note?: string }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId: rawId } = await context.params;
  const clientId = decodeURIComponent(rawId);

  if (!validClientId(clientId)) {
    return NextResponse.json({ error: "invalid_client_id" }, { status: 400 });
  }

  let body: { note?: string };
  try {
    body = (await request.json()) as { note?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.note !== "string") {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  await prisma.clientPortalMeta.upsert({
    where: { clientId },
    create: {
      clientId,
      hasActiveContract: false,
      note: body.note.slice(0, MAX_NOTE),
    },
    update: {
      note: body.note.slice(0, MAX_NOTE),
    },
  });

  const row = await prisma.clientPortalMeta.findUnique({
    where: { clientId },
  });

  return NextResponse.json({
    note: row?.note ?? "",
  });
}
