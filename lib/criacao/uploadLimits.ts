/** Máx. faixas (metadados) por POST — um job por requisição; evita timeout Prisma/Netlify. */
export const UPLOAD_MAX_FILES_PER_REQUEST = 700;

/** Itens inseridos por createMany ao montar um job (evita timeout em lote único grande). */
export const UPLOAD_ITEM_CREATE_BATCH = 150;
