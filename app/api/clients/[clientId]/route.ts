import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_NOTE = 50_000;
const MAX_CLIENT_ID_LEN = 128;

/** Id de cliente Conta Azul (UUID ou similar) — evita path injection. */
function validClientId(id: string): boolean {
  if (!id || id.length > MAX_CLIENT_ID_LEN) return false;
  if (/[\s/\\]/.test(id)) return false;
  return true;
}

type PatchBody = {
  note?: string;
  painelBloqueio?: boolean;
  painelInativo?: boolean;
};

/**
 * PATCH body: pelo menos um de `note` | `painelBloqueio` | `painelInativo`.
 * Nota interna (histórico até ~50 kb); marcas do painel são booleanas persistidas por cliente.
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

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const hasNote = typeof body.note === "string";
  const hasBloqueio = typeof body.painelBloqueio === "boolean";
  const hasInativo = typeof body.painelInativo === "boolean";
  if (!hasNote && !hasBloqueio && !hasInativo) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const update: {
    note?: string;
    painelBloqueio?: boolean;
    painelInativo?: boolean;
  } = {};
  if (hasNote) update.note = body.note!.slice(0, MAX_NOTE);
  if (hasBloqueio) update.painelBloqueio = body.painelBloqueio;
  if (hasInativo) update.painelInativo = body.painelInativo;

  await prisma.clientPortalMeta.upsert({
    where: { clientId },
    create: {
      clientId,
      hasActiveContract: false,
      note: hasNote ? body.note!.slice(0, MAX_NOTE) : "",
      painelBloqueio: hasBloqueio ? body.painelBloqueio! : false,
      painelInativo: hasInativo ? body.painelInativo! : false,
    },
    update,
  });

  const row = await prisma.clientPortalMeta.findUnique({
    where: { clientId },
    select: { note: true, painelBloqueio: true, painelInativo: true },
  });

  return NextResponse.json({
    note: row?.note ?? "",
    painelBloqueio: row?.painelBloqueio ?? false,
    painelInativo: row?.painelInativo ?? false,
  });
}
