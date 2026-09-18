/** Faixas por job (um POST) — criação Prisma + resposta Netlify. Acima disso o portal divide em partes. */
export const UPLOAD_MAX_FILES_PER_JOB = 500;

/** Teto absoluto por POST (proteção API); acima do normal indica cliente desatualizado. */
export const UPLOAD_MAX_FILES_PER_REQUEST = 550;

/** Itens inseridos por createMany ao montar um job (evita timeout em lote único grande). */
export const UPLOAD_ITEM_CREATE_BATCH = 150;
