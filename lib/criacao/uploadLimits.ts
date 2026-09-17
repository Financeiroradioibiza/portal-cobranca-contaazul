/** Máx. lotes (jobs) por POST /api/criacao/upload — evita 504 Netlify na criação Prisma. */
export const UPLOAD_MAX_LOTES_PER_REQUEST = 2;

/** Máx. faixas (metadados) por POST — um job grande ainda cabe se for só 1 lote. */
export const UPLOAD_MAX_FILES_PER_REQUEST = 700;

/** Itens inseridos por createMany ao montar um job (evita timeout em lote único grande). */
export const UPLOAD_ITEM_CREATE_BATCH = 150;
