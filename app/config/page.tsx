import { redirect } from "next/navigation";
import { CONFIG_HOME_HREF } from "@/lib/portal/configNav";

export default function ConfigPage() {
  redirect(CONFIG_HOME_HREF);
}
