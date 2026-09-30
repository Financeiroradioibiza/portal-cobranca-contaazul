import "server-only";

export type VapidConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.PUSH_VAPID_SUBJECT?.trim() ||
    process.env.OC_EMAIL_FROM_CHAMADOS?.trim() ||
    "mailto:chamados@radioibiza.com.br";
  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}
