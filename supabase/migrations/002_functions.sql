-- ============================================================
-- AdaptaJIREH — Migración 002: Funciones PostgreSQL
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 001)
-- ============================================================

-- ─── Incrementar items_completados ────────────────────────────
CREATE OR REPLACE FUNCTION incrementar_items_completados(p_id_sesion UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE sesion
  SET items_completados = COALESCE(items_completados, 0) + 1
  WHERE id_sesion = p_id_sesion;
$$;

-- ─── Cerrar sesión y calcular duración ────────────────────────
CREATE OR REPLACE FUNCTION cerrar_sesion(p_id_sesion UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE sesion
  SET
    hora_fin     = NOW(),
    duracion_min = ROUND(
      EXTRACT(EPOCH FROM (NOW() - hora_inicio)) / 60.0, 2
    )
  WHERE id_sesion = p_id_sesion;
$$;

-- ─── Evolución de R(t) por día ────────────────────────────────
CREATE OR REPLACE FUNCTION get_retention_chart(
  p_id_materia UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  fecha              DATE,
  promedio_retencion FLOAT,
  estudiantes_activos BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    DATE(r.timestamp_resp)          AS fecha,
    AVG(r.R_post)                   AS promedio_retencion,
    COUNT(DISTINCT r.id_estudiante) AS estudiantes_activos
  FROM respuesta r
  JOIN item            i   ON r.id_item   = i.id_item
  JOIN unidad_curricular uc ON i.id_unidad = uc.id_unidad
  WHERE r.timestamp_resp >= p_fecha_desde
    AND (p_id_materia IS NULL OR uc.id_materia = p_id_materia)
  GROUP BY DATE(r.timestamp_resp)
  ORDER BY fecha ASC;
$$;

-- ─── Estudiantes en riesgo (TO > 0.7 en 3+ ítems, 14 días) ───
CREATE OR REPLACE FUNCTION get_at_risk_students()
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
  WHERE r.TO_rate > 0.7
    AND r.timestamp_resp >= NOW() - INTERVAL '14 days'
  GROUP BY r.id_estudiante, u.nombre_usuario, uc.nombre
  HAVING COUNT(*) >= 3
  ORDER BY olvidos_consecutivos DESC;
$$;

-- ─── Exportación CSV para SPSS / Excel ───────────────────────
CREATE OR REPLACE FUNCTION export_research_csv(
  p_id_materia  UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  codigo_anonimo VARCHAR,
  grado          VARCHAR,
  materia        VARCHAR,
  unidad         VARCHAR,
  fecha          DATE,
  nro_sesion     BIGINT,
  "SST"          NUMERIC,
  "TO"           NUMERIC,
  "IRE"          SMALLINT,
  "D_post"       NUMERIC,
  "S_post"       NUMERIC,
  "R_post"       NUMERIC,
  "ELC"          NUMERIC,
  "CE"           VARCHAR,
  "DD"           SMALLINT,
  "CR"           VARCHAR,
  rating_frs     SMALLINT,
  duracion_min   NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    u.codigo_anonimo,
    u.grado,
    m.nombre                     AS materia,
    uc.nombre                    AS unidad,
    DATE(r.timestamp_resp)       AS fecha,
    ROW_NUMBER() OVER (
      PARTITION BY r.id_estudiante
      ORDER BY r.timestamp_resp
    )                            AS nro_sesion,
    r.SST,
    r.TO_rate                    AS "TO",
    r.IRE_dias                   AS "IRE",
    r.D_post,
    r.S_post,
    r.R_post,
    r.ELC,
    r.CE,
    r.DD,
    r.CR,
    r.rating_frs,
    s.duracion_min
  FROM respuesta r
  JOIN usuario           u   ON r.id_estudiante = u.id_usuario
  JOIN sesion            s   ON r.id_sesion     = s.id_sesion
  JOIN materia           m   ON s.id_materia    = m.id_materia
  JOIN item              i   ON r.id_item       = i.id_item
  JOIN unidad_curricular uc  ON i.id_unidad     = uc.id_unidad
  WHERE r.timestamp_resp >= p_fecha_desde
    AND (p_id_materia IS NULL OR m.id_materia = p_id_materia)
  ORDER BY u.codigo_anonimo, r.timestamp_resp;
$$;
