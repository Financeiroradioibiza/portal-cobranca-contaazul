import { redirect } from "next/navigation";

/** Atalho antigo — Instalação 8 fica em Suporte → Instalação (tipo 8). */
export default function SuporteInstalacaoMicrosoftStoreRedirect() {
  redirect("/suporte/instalacao");
}
