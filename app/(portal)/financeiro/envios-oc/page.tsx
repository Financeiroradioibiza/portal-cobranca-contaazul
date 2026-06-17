import { redirect } from "next/navigation";
import { ENVIOS_MANUAIS_EXTERNAL_URL } from "@/lib/portal/financeiroNav";

export default function FinanceiroEnviosManuaisPage() {
  redirect(ENVIOS_MANUAIS_EXTERNAL_URL);
}
