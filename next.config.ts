import type { NextConfig } from "next";

function securityHeaders(): { key: string; value: string }[] {
  const h: { key: string; value: string }[] = [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
  ];
  if (process.env.NODE_ENV === "production") {
    h.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
    h.push({
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "media-src 'self' https://cloud2.radioibiza.app.br https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    });
  }
  return h;
}

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/planilha-rio", destination: "/financeiro/planilha-rio", permanent: true },
      { source: "/manual", destination: "/financeiro/envios-oc", permanent: true },
      { source: "/cobranca", destination: "/financeiro/planilha-rio", permanent: false },
      { source: "/cobranca/:path*", destination: "/financeiro/:path*", permanent: true },
      { source: "/producao", destination: "/", permanent: true },
      { source: "/producao/dashboard", destination: "/", permanent: true },
      { source: "/producao/suporte", destination: "/suporte", permanent: true },
      { source: "/producao/:path*", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
