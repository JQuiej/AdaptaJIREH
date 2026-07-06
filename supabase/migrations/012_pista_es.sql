-- ============================================================
-- AdaptaJIREH — Migración 012: traducción al español de la pista
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 011)
--
-- QUÉ HACE:
--   Agrega la columna 'pista_es' a item. Cuando la pista original está en inglés,
--   se guarda aquí su traducción al español y el alumno la ve directamente en
--   español al abrir «¿Necesitas una pista?». Si la pista ya está en español,
--   pista_es queda NULL y se muestra la original.
--
--   Para traducir las pistas de ítems YA existentes, corre después:
--     node supabase/scripts/backfill-traducciones.mjs
-- ============================================================

ALTER TABLE item
  ADD COLUMN IF NOT EXISTS pista_es TEXT;
