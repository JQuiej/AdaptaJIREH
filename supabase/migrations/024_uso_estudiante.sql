-- ============================================================
-- AdaptaJIREH — Migración 024: porcentaje de uso por estudiante
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 023)
--
-- QUÉ HACE:
--   Crea la función get_student_usage, que devuelve el PORCENTAJE DE USO de cada
--   estudiante inscrito en las materias del docente. Usa la MISMA lógica que el
--   script supabase/scripts/porcentaje_uso.sql:
--
--     dias_transcurridos = (hoy − primera respuesta) + 1   (hora de Guatemala)
--     dias_activos       = días distintos con al menos una respuesta
--     porcentaje_uso     = dias_activos / dias_transcurridos * 100
--
--   Los días que el alumno dejó de entrar —incluidos los recientes hasta hoy—
--   cuentan como inactivos y bajan el porcentaje. Los estudiantes inscritos que
--   nunca han respondido aparecen con 0% (sin actividad).
-- ============================================================

DROP FUNCTION IF EXISTS get_student_usage(UUID);
CREATE FUNCTION get_student_usage(
  p_id_docente UUID DEFAULT NULL
)
RETURNS TABLE (
  id_estudiante      UUID,
  codigo_anonimo     VARCHAR,
  grado              VARCHAR,
  primera_fecha      DATE,
  ultima_fecha       DATE,
  dias_transcurridos INTEGER,
  dias_activos       BIGINT,
  dias_inactivos     BIGINT,
  total_respuestas   BIGINT,
  porcentaje_uso     NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH estudiantes AS (
    -- Estudiantes inscritos en alguna materia del docente (únicos).
    SELECT DISTINCT ins.id_estudiante
    FROM inscripcion ins
    JOIN materia m ON m.id_materia = ins.id_materia
    WHERE p_id_docente IS NULL OR m.id_docente = p_id_docente
  ),
  dias AS (
    SELECT
      r.id_estudiante,
      (r.timestamp_resp AT TIME ZONE 'America/Guatemala')::date AS dia
    FROM respuesta r
    WHERE r.id_estudiante IN (SELECT id_estudiante FROM estudiantes)
  ),
  agg AS (
    SELECT
      id_estudiante,
      MIN(dia)                                                       AS primera_fecha,
      MAX(dia)                                                       AS ultima_fecha,
      COUNT(DISTINCT dia)                                            AS dias_activos,
      ((now() AT TIME ZONE 'America/Guatemala')::date - MIN(dia)) + 1 AS dias_transcurridos,
      COUNT(*)                                                       AS total_respuestas
    FROM dias
    GROUP BY id_estudiante
  )
  SELECT
    e.id_estudiante,
    u.codigo_anonimo,
    u.grado,
    a.primera_fecha,
    a.ultima_fecha,
    a.dias_transcurridos,
    COALESCE(a.dias_activos, 0)                       AS dias_activos,
    (a.dias_transcurridos - a.dias_activos)           AS dias_inactivos,
    COALESCE(a.total_respuestas, 0)                   AS total_respuestas,
    CASE
      WHEN a.dias_transcurridos IS NULL OR a.dias_transcurridos = 0 THEN 0
      ELSE ROUND(100.0 * a.dias_activos / a.dias_transcurridos, 1)
    END                                               AS porcentaje_uso
  FROM estudiantes e
  JOIN usuario u ON u.id_usuario = e.id_estudiante
  LEFT JOIN agg a ON a.id_estudiante = e.id_estudiante
  ORDER BY porcentaje_uso DESC, u.codigo_anonimo;
$$;
