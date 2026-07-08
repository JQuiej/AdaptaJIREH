-- ============================================================
-- AdaptaJIREH — Limpieza SOLO de la materia de Matemáticas
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- QUÉ HACE:
--   Borra TODOS los ítems y TODA la teoría de las materias de matemáticas,
--   para regenerarlos desde cero (tras bajar la dificultad de la generación).
--   Al borrar los ítems, por las FK ON DELETE CASCADE también se borran:
--     · item_fsrs  (programaciones FSRS de los alumnos sobre esos ítems)
--     · respuesta  (respuestas de los alumnos a esos ítems) y su
--       retroalimentacion asociada.
--
-- QUÉ NO TOCA:
--   · Los temas (unidad_curricular) se conservan: solo se vacía su
--     contenido. Podrás volver a subir material sobre los mismos temas.
--   · Otras materias (Inglés, etc.), usuarios, inscripciones y sesiones.
--
-- CRITERIO "es matemáticas": el nombre de la materia contiene alguna de las
--   raíces típicas (sin distinguir mayúsculas y evitando acentos). Coincide con
--   esMateriaMatematicas() de lib/idioma.js:
--     matem | math | aritm | lgebra | geometr | lculo
--   (los fragmentos evitan las tildes: Álgebra→'lgebra', Cálculo→'lculo').
--
-- ⚠ ES DESTRUCTIVO para el contenido de matemáticas. Haz respaldo si dudas.
-- ============================================================

-- ── 0a. Confirma QUÉ materias coincidirán (revisa que sean de matemáticas) ──
SELECT m.id_materia, m.nombre
FROM materia m
WHERE m.nombre ILIKE '%matem%'
   OR m.nombre ILIKE '%math%'
   OR m.nombre ILIKE '%aritm%'
   OR m.nombre ILIKE '%lgebra%'
   OR m.nombre ILIKE '%geometr%'
   OR m.nombre ILIKE '%lculo%'
ORDER BY m.nombre;

-- ── 0b. Vista previa: cuánto se va a borrar ──────────────────────
WITH unidades_mate AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%matem%'
     OR m.nombre ILIKE '%math%'
     OR m.nombre ILIKE '%aritm%'
     OR m.nombre ILIKE '%lgebra%'
     OR m.nombre ILIKE '%geometr%'
     OR m.nombre ILIKE '%lculo%'
)
SELECT
  (SELECT COUNT(*) FROM item      WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate)) AS items_a_borrar,
  (SELECT COUNT(*) FROM teoria    WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate)) AS teorias_a_borrar,
  (SELECT COUNT(*) FROM respuesta WHERE id_item IN
     (SELECT id_item FROM item WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate)))   AS respuestas_a_borrar,
  (SELECT COUNT(*) FROM unidades_mate)                                                       AS temas_afectados;

-- ── 1. Limpieza (transaccional) ──────────────────────────────────
BEGIN;

WITH unidades_mate AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%matem%'
     OR m.nombre ILIKE '%math%'
     OR m.nombre ILIKE '%aritm%'
     OR m.nombre ILIKE '%lgebra%'
     OR m.nombre ILIKE '%geometr%'
     OR m.nombre ILIKE '%lculo%'
)
DELETE FROM item
WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate);
-- (item_fsrs, respuesta y retroalimentacion se borran en cascada)

WITH unidades_mate AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%matem%'
     OR m.nombre ILIKE '%math%'
     OR m.nombre ILIKE '%aritm%'
     OR m.nombre ILIKE '%lgebra%'
     OR m.nombre ILIKE '%geometr%'
     OR m.nombre ILIKE '%lculo%'
)
DELETE FROM teoria
WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate);

COMMIT;

-- ── 2. Verificación: debe devolver 0, 0 y 0 ──────────────────────
WITH unidades_mate AS (
  SELECT u.id_unidad
  FROM unidad_curricular u
  JOIN materia m ON m.id_materia = u.id_materia
  WHERE m.nombre ILIKE '%matem%'
     OR m.nombre ILIKE '%math%'
     OR m.nombre ILIKE '%aritm%'
     OR m.nombre ILIKE '%lgebra%'
     OR m.nombre ILIKE '%geometr%'
     OR m.nombre ILIKE '%lculo%'
)
SELECT
  (SELECT COUNT(*) FROM item      WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate)) AS items_restantes,
  (SELECT COUNT(*) FROM teoria    WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate)) AS teorias_restantes,
  (SELECT COUNT(*) FROM respuesta WHERE id_item IN
     (SELECT id_item FROM item WHERE id_unidad IN (SELECT id_unidad FROM unidades_mate)))   AS respuestas_restantes;
