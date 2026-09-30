import { normalizePortalEmail } from "@/lib/auth/users";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";

function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Extrai tokens @… do texto e resolve para e-mails de participantes do portal. */
export function resolveMentionEmails(
  corpo: string,
  participants: ChamadoParticipant[],
): { mencoes: string[]; corpoRender: string } {
  const mencoes = new Set<string>();
  const re = /@([a-zA-Z0-9._\-]+(?:@[a-zA-Z0-9.\-]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo)) !== null) {
    const token = m[1]!.trim();
    if (!token) continue;
    if (token.includes("@")) {
      const email = normalizePortalEmail(token);
      if (email.includes("@")) mencoes.add(email);
      continue;
    }
    const needle = token.toLowerCase();
    for (const p of participants) {
      const emailLocal = p.email.split("@")[0]!.toLowerCase();
      const nameSlug = slugifyName(p.displayName);
      if (
        emailLocal === needle ||
        nameSlug === needle ||
        nameSlug.startsWith(needle) ||
        p.displayName.toLowerCase().includes(needle)
      ) {
        mencoes.add(normalizePortalEmail(p.email));
      }
    }
  }
  return { mencoes: [...mencoes], corpoRender: corpo };
}

export function normalizeConversaSlug(raw: string): string {
  const s = raw
    .trim()
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return s;
}

export function conversaDisplayTitulo(slug: string, titulo?: string): string {
  const t = titulo?.trim();
  if (t) return t.startsWith("#") ? t : `#${t}`;
  return `#${slug}`;
}
