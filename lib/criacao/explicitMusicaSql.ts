import { Prisma } from "@prisma/client";

/** Faixa com EXP (Gemini/moderacao) ou Deezer explicit_lyrics. */
export const EXPLICIT_MUSICA_SQL = Prisma.sql`EXISTS (
  SELECT 1
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(m.tags_auto::jsonb) = 'array' THEN m.tags_auto::jsonb
      ELSE '[]'::jsonb
    END
  ) AS elem
  WHERE (
    elem->>'fonte' = 'deezer'
    AND elem->>'chave' = 'explicit'
    AND elem->>'valor' = 'sim'
  ) OR (
    elem->>'fonte' = 'gemini'
    AND elem->>'chave' = 'explicit'
    AND elem->>'valor' = 'sim'
  ) OR (
    elem->>'fonte' = 'moderacao'
    AND elem->>'chave' = 'explicit'
    AND elem->>'valor' = 'EXP'
  )
)`;
