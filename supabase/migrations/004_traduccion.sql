-- ============================================================
-- AdaptaJIREH — Migración 004: Traducción al español de ítems
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 003)
-- ============================================================
-- Para ítems en inglés (según el nivel del alumno), se pre-genera la
-- traducción de la pregunta al momento de guardar el material y se muestra
-- al estudiante solo si decide verla. Es NULL cuando la pregunta ya está
-- en español (no requiere traducción).

ALTER TABLE item
  ADD COLUMN IF NOT EXISTS pregunta_es TEXT;
