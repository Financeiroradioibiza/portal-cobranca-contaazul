import type { Config } from "@netlify/functions";

/** Cron Netlify: dispara o night-worker do Servidor UP (Deemix + fila + staging). */
export default async (request: Request) => {
  const secret =
    (process.env.OC_EMAIL_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (secret.length < 16) {
    console.error(
      "[servidor-up-night-worker] Defina OC_EMAIL_CRON_SECRET ou CRON_SECRET (≥16) no Netlify.",
    );
    return;
  }

  const url = new URL(
    "/api/criacao/servidor-up/night-worker?downloadLimit=15",
    request.url,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  });

  const body = await res.text();
  console.log("[servidor-up-night-worker]", res.status, body.slice(0, 2000));
  if (!res.ok) {
    throw new Error(`night-worker HTTP ${res.status}`);
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
