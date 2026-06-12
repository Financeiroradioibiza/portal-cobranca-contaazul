import { redirect } from "next/navigation";
import { PRODUCAO_HOME_HREF } from "@/lib/portal/producaoNav";

export default function ProducaoPage() {
  redirect(PRODUCAO_HOME_HREF);
}
