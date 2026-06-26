import { redirect } from "next/navigation";

/** Atalho legado — envios OC ficam no portal. */
export default function ManualLegacyPage() {
  redirect("/financeiro/envios-oc");
}
