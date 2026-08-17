-- Planilha Rio: PDV cortesia (não entra no Nº PDV / valor do contrato; player segue ativo).
ALTER TYPE "RioTagCobranca" ADD VALUE IF NOT EXISTS 'cortesia';
