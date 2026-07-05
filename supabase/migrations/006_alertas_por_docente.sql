-- ============================================================
-- AdaptaJIREH — Migración 006: Alertas acotadas por docente
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 005)
--
-- Cada docente debe ver únicamente a los estudiantes en riesgo de
-- las materias que tiene asignadas. Se reemplaza get_at_risk_students()
-- por una versión que filtra por el docente autenticado.
-- ============================================================

DROP FUNCTION IF EXISTS get_at_risk_students();

CREATE OR REPLACE FUNCTION get_at_risk_students(p_id_docente UUID DEFAULT NULL)
RETURNS TABLE (
  id_estudiante        UUID,
  nombre_usuario       VARCHAR,
  nombre_unidad        VARCHAR,
  olvidos_consecutivos BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    r.id_estudiante,
    u.nombre_usuario,
    uc.nombre            AS nombre_unidad,
    COUNT(*)             AS olvidos_consecutivos
  FROM respuesta r
  JOIN usuario          u   ON r.id_estudiante = u.id_usuario
  JOIN item             i   ON r.id_item       = i.id_item
  JOIN unidad_curricular uc ON i.id_unidad     = uc.id_unidad
  JOIN materia          m   ON uc.id_materia   = m.id_materia
  WHERE r.TO_rate > 0.7
    AND r.timestamp_resp >= NOW() - INTERVAL '14 days'
    AND (p_id_docente IS NULL OR m.id_docente = p_id_docente)
  GROUP BY r.id_estudiante, u.nombre_usuario, uc.nombre
  HAVING COUNT(*) >= 3
  ORDER BY olvidos_consecutivos DESC;
$$;
