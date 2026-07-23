-- ============================================================
-- AdaptaJIREH — Migración 022: punteo del juez (grade_score)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 021)
--
-- Guarda el PUNTEO DE CONOCIMIENTO que ve el estudiante: la corrección de
-- contenido juzgada por el LLM con rúbrica por conceptos. Es más exacto que el
-- SST (similitud por embeddings) para reflejar cuánto sabe el alumno.
--
-- La columna `sst` NO se modifica: sigue guardando la Similitud Semántica
-- Textual como variable descriptiva de la tesis. Este `grade_score` es una
-- medida SEPARADA y limpia, disponible solo para respuestas nuevas (las previas
-- quedan en NULL, marcando el corte de criterio de calificación).
-- ============================================================

ALTER TABLE respuesta
  ADD COLUMN IF NOT EXISTS grade_score NUMERIC(5,4);  -- corrección [0,1] juzgada por el LLM (lo que ve el alumno)

COMMENT ON COLUMN respuesta.grade_score IS
  'Punteo de conocimiento [0,1] del juez LLM (rúbrica por conceptos); es el valor que ve el estudiante. Distinto de sst (embeddings). NULL en respuestas anteriores a la migración 022.';
