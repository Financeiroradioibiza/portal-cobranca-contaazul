import { redirect } from "next/navigation";
import { COBRANCA_HOME_HREF } from "@/lib/portal/cobrancaNav";

/** Raiz do site → módulo Cobrança / vencidos (URLs antigas redirecionam em next.config). */
export default function Home() {
  redirect(COBRANCA_HOME_HREF);
}
