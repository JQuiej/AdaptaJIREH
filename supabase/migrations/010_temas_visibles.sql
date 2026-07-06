-- ============================================================
-- AdaptaJIREH — Migración 010: visibilidad de temas (liberación gradual)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 009)
--
-- QUÉ HACE:
--   Agrega la columna 'visible' a unidad_curricular. Cuando un tema está oculto
--   (visible = FALSE), los alumnos NO ven su teoría en «Aprender» ni reciben sus
--   ítems en las sesiones de repaso. El docente lo activa desde el módulo «Temas».
--
--   Los temas YA existentes quedan visibles (DEFAULT TRUE) para no romper el uso
--   actual. Los temas NUEVOS creados desde el panel se insertan como ocultos
--   (la API los crea con visible = FALSE).
-- ============================================================

ALTER TABLE unidad_curricular
  ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;
