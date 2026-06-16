import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ id?: string; prospectId?: string }> };

export default async function ClientePdvNovoRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.id) qs.set("id", sp.id);
  if (sp.prospectId) qs.set("prospectId", sp.prospectId);
  const suffix = qs.toString();
  redirect(suffix ? `/cadastros/solicitar-pdv?${suffix}` : "/cadastros/solicitar-pdv");
}
