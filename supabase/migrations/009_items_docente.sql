-- ============================================================
-- AdaptaJIREH — Migración 009: banco de ítems del docente con estadísticas
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 008)
--
-- QUÉ HACE:
--   Crea la función get_teacher_items, que devuelve los ítems creados por un
--   docente (a través de sus materias) junto con estadísticas de las respuestas
--   de los estudiantes: número de respuestas, % de aciertos (AVG de PA),
--   similitud semántica promedio (SST), rating FSRS y tiempo promedio.
--
--   Un "acierto" es PA = 1 (rating ≥ 3 ⇔ gradeScore ≥ 0.71), el mismo umbral
--   de "dominado" del sistema.
-- ============================================================

DROP FUNCTION IF EXISTS get_teacher_items(UUID, UUID);
CREATE FUNCTION get_teacher_items(
  p_id_docente UUID,
  p_id_materia UUID DEFAULT NULL
)
RETURNS TABLE (
  id_item          UUID,
  pregunta         TEXT,
  respuesta_ref    TEXT,
  pista            TEXT,
  nivel_bloom      INTEGER,
  activo           BOOLEAN,
  creado_en        TIMESTAMPTZ,
  id_materia       UUID,
  materia          TEXT,
  id_unidad        UUID,
  unidad           TEXT,
  total_respuestas BIGINT,
  estudiantes      BIGINT,
  precision_prom   NUMERIC,   -- AVG(pa)  → % de aciertos
  sst_prom         NUMERIC,   -- AVG(sst)
  rating_prom      NUMERIC,   -- AVG(rating_frs) 0-4
  tiempo_prom_ms   NUMERIC,   -- AVG(tiempo_respuesta_ms)
  ultima_respuesta TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    i.id_item,
    i.pregunta,
    i.respuesta_ref,
    i.pista,
    i.nivel_bloom,
    i.activo,
    i.creado_en,
    m.id_materia,
    m.nombre                              AS materia,
    uc.id_unidad,
    uc.nombre                             AS unidad,
    COUNT(r.id_respuesta)                 AS total_respuestas,
    COUNT(DISTINCT r.id_estudiante)       AS estudiantes,
    ROUND(AVG(r.pa), 4)                   AS precision_prom,
    ROUND(AVG(r.sst), 4)                  AS sst_prom,
    ROUND(AVG(r.rating_frs), 2)           AS rating_prom,
    ROUND(AVG(r.tiempo_respuesta_ms), 0)  AS tiempo_prom_ms,
    MAX(r.timestamp_resp)                 AS ultima_respuesta
  FROM item i
  JOIN unidad_curricular uc ON i.id_unidad   = uc.id_unidad
  JOIN materia           m  ON uc.id_materia  = m.id_materia
  LEFT JOIN respuesta    r  ON r.id_item      = i.id_item
  WHERE (p_id_docente IS NULL OR m.id_docente = p_id_docente)
    AND (p_id_materia IS NULL OR m.id_materia = p_id_materia)
  GROUP BY
    i.id_item, i.pregunta, i.respuesta_ref, i.pista, i.nivel_bloom, i.activo, i.creado_en,
    m.id_materia, m.nombre, uc.id_unidad, uc.nombre
  ORDER BY uc.nombre, i.nivel_bloom, i.creado_en;
$$;
