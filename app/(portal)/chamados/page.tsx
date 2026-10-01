import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChamadosIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.set(k, v);
  }
  const suffix = qs.toString();
  const hasChamado = Boolean(sp.chamado);
  const base = hasChamado ? "/chamados/kanban" : "/chamados/conversas";
  redirect(suffix ? `${base}?${suffix}` : base);
}
