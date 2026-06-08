import { redirect } from "next/navigation";
import { CADASTROS_HOME_HREF } from "@/lib/portal/cadastrosNav";

export default function CadastrosHome() {
  redirect(CADASTROS_HOME_HREF);
}
