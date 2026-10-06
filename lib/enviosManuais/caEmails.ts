import { billingEmailJoined, fetchPersonDetail } from "@/lib/contaazul/personBilling";
import { parseEmailAddresses } from "@/lib/format";

export async function fetchCaClienteEmails(token: string, clienteId: string): Promise<string[]> {
  const raw = await fetchPersonDetail(token, clienteId);
  const joined = billingEmailJoined(raw);
  if (!joined) return [];
  return parseEmailAddresses(joined);
}
