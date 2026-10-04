import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listTags } from "@/lib/criacao/tagService";
import { sortTagOwnerLabels } from "@/lib/criacao/bibliotecaTagOwnerFilter";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const tags = await listTags();
    const byKey = new Map<string, { key: string; label: string; email: string | null }>();
    for (const t of tags) {
      const email = t.criativoUserId?.trim() || null;
      const label = (t.criativoNome || email || "—").trim();
      const key = email || label;
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { key, label, email });
    }
    const criativos = [...byKey.values()].sort((a, b) => sortTagOwnerLabels(a.label, b.label));
    return NextResponse.json({ ok: true, criativos });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/tags/criativos GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
