/** Headers para polling em background — não dispara reportClientError. */
export const POLL_SKIP_REPORT_HEADERS = { "X-Skip-Error-Report": "1" } as const;

/** Sessão expirada — interrompe intervalos para não inflar 401 no Netlify. */
export function isUnauthorizedPollResponse(res: Response): boolean {
  return res.status === 401;
}
