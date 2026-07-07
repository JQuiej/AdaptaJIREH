-- ============================================================
-- AdaptaJIREH — Limpieza SOLO de la materia de Inglés
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- QUÉ HACE:
--   Borra TODOS los ítems y TODA la teoría de las materias de inglés,
--   para regenerarlos desde cero (tras cambiar el prompt de generación).
--   Al borrar los ítems, por las FK ON DELETE CASCADE también se borran:
--     · item_fsrs  (programaciones FSRS de los alumnos sobre esos ítems)
--     · respuesta  (respuestas de los alumnos a esos ítems) y su
--       retroalimentacion asociada.
--
-- QUÉ NO TOCA:
--   · Los temas (unidad_curricular) se conservan: solo se vacía su
--     contenido. Podrás volver a subir material sobre los mismos temas.
--   · Otras materias (Matemáticas, etc.), usuarios e inscripciones.
--
-- CRITERIO "es inglés": el nombre de la materia contiene 'ingl' o
--   'english' (sin distinguir mayúsculas). Coincide con esMateriaIngles()
--   de lib/idioma.js.
--
-- ⚠ ES DESTRUCTIVO para el contenido de inglés. Haz respaldo si dudas.
-- ============================================================

-- ── 0. Vista previa: qué se va a borrar (revisa antes de confirmar) ──
WITH unidades_ingles AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%ingl%' OR m.nombre ILIKE '%english%'
)
SELECT
  (SELECT COUNT(*) FROM item   WHERE id_unidad IN (SELECT id_unidad FROM unidades_ingles)) AS items_a_borrar,
  (SELECT COUNT(*) FROM teoria WHERE id_unidad IN (SELECT id_unidad FROM unidades_ingles)) AS teorias_a_borrar,
  (SELECT COUNT(*) FROM unidades_ingles)                                                   AS temas_afectados;

-- ── 1. Limpieza (transaccional) ──────────────────────────────────
BEGIN;

WITH unidades_ingles AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%ingl%' OR m.nombre ILIKE '%english%'
)
DELETE FROM item
WHERE id_unidad IN (SELECT id_unidad FROM unidades_ingles);
-- (item_fsrs, respuesta y retroalimentacion se borran en cascada)

WITH unidades_ingles AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%ingl%' OR m.nombre ILIKE '%english%'
)
DELETE FROM teoria
WHERE id_unidad IN (SELECT id_unidad FROM unidades_ingles);

COMMIT;

-- ── 2. Verificación: debe devolver 0 y 0 ─────────────────────────
WITH unidades_ingles AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%ingl%' OR m.nombre ILIKE '%english%'
)
SELECT
  (SELECT COUNT(*) FROM item   WHERE id_unidad IN (SELECT id_unidad FROM unidades_ingles)) AS items_restantes,
  (SELECT COUNT(*) FROM teoria WHERE id_unidad IN (SELECT id_unidad FROM unidades_ingles)) AS teorias_restantes;
