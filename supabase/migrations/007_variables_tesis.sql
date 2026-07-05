-- ============================================================
-- AdaptaJIREH — Migración 007: Reorganización de las 10 variables
--                              independientes de la tesis
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 006)
--
-- CAMBIO:
--   Se eliminan 3 variables redundantes de la tabla `respuesta`:
--     · to_rate  (Tasa de Olvido)
--     · r_post   (Retención — SOLO la variable de investigación; la R
--                 interna de FSRS en item_fsrs.r NO se toca)
--     · elc      (Estado Latente de Conocimiento)
--   Se agregan 3 variables nuevas:
--     · tr  (Índice de Transferencia)        — Bloom 3 = cercana, 4 = lejana
--     · pa  (Precisión en Primer Intento)    — acierto 1er intento (1/0)
--     · ar  (Adherencia al Repaso)           — repaso a tiempo (1/0)
--
--   Las 10 variables quedan: D, S, IRE, SST, CE, DD, CR, TR, PA, AR.
--
--   Se redefinen las funciones que dependían de las variables retiradas:
--     · get_retention_chart   → ahora grafica PA y AR en el tiempo
--     · export_research_csv   → nuevas columnas para SPSS
--     · get_at_risk_students  → riesgo por baja precisión (PA < 0.5)
-- ============================================================

-- ── 1. Nuevas columnas ───────────────────────────────────────
ALTER TABLE respuesta
  ADD COLUMN IF NOT EXISTS tr NUMERIC(5,4),  -- Índice de Transferencia (NULL si el ítem no es de transferencia)
  ADD COLUMN IF NOT EXISTS pa NUMERIC(5,4),  -- Precisión en Primer Intento (1 = acierto, 0 = fallo)
  ADD COLUMN IF NOT EXISTS ar NUMERIC(5,4);  -- Adherencia al Repaso (1 = a tiempo, 0 = tarde)

-- ── 2. Redefinir funciones que referenciaban las variables viejas ──

-- 2a. Evolución temporal: ahora PA (precisión) y AR (adherencia).
DROP FUNCTION IF EXISTS get_retention_chart(UUID, TIMESTAMPTZ);
CREATE FUNCTION get_retention_chart(
  p_id_materia  UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  fecha               DATE,
  promedio_pa         FLOAT,
  promedio_ar         FLOAT,
  estudiantes_activos BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    DATE(r.timestamp_resp)          AS fecha,
    AVG(r.pa)                       AS promedio_pa,
    AVG(r.ar)                       AS promedio_ar,
    COUNT(DISTINCT r.id_estudiante) AS estudiantes_activos
  FROM respuesta r
  JOIN item             i  ON r.id_item   = i.id_item
  JOIN unidad_curricular uc ON i.id_unidad = uc.id_unidad
  WHERE r.timestamp_resp >= p_fecha_desde
    AND (p_id_materia IS NULL OR uc.id_materia = p_id_materia)
  GROUP BY DATE(r.timestamp_resp)
  ORDER BY fecha ASC;
$$;

-- 2b. Estudiantes en riesgo: baja precisión en primer intento (PA < 0.5),
--     acotado por docente (ver migración 006).
DROP FUNCTION IF EXISTS get_at_risk_students(UUID);
DROP FUNCTION IF EXISTS get_at_risk_students();
CREATE FUNCTION get_at_risk_students(p_id_docente UUID DEFAULT NULL)
RETURNS TABLE (
  id_estudiante   UUID,
  nombre_usuario  VARCHAR,
  nombre_unidad   VARCHAR,
  items_evaluados BIGINT,
  precision_prom  NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    r.id_estudiante,
    u.nombre_usuario,
    uc.nombre                       AS nombre_unidad,
    COUNT(*)                        AS items_evaluados,
    ROUND(AVG(r.pa), 2)             AS precision_prom
  FROM respuesta r
  JOIN usuario           u  ON r.id_estudiante = u.id_usuario
  JOIN item              i  ON r.id_item       = i.id_item
  JOIN unidad_curricular uc ON i.id_unidad     = uc.id_unidad
  JOIN materia           m  ON uc.id_materia   = m.id_materia
  WHERE r.timestamp_resp >= NOW() - INTERVAL '14 days'
    AND r.pa IS NOT NULL
    AND (p_id_docente IS NULL OR m.id_docente = p_id_docente)
  GROUP BY r.id_estudiante, u.nombre_usuario, uc.nombre
  HAVING COUNT(*) >= 3 AND AVG(r.pa) < 0.5
  ORDER BY precision_prom ASC;
$$;

-- 2c. Exportación CSV para SPSS con las 10 variables nuevas.
DROP FUNCTION IF EXISTS export_research_csv(UUID, TIMESTAMPTZ);
CREATE FUNCTION export_research_csv(
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
  "D"            NUMERIC,
  "S"            NUMERIC,
  "IRE"          SMALLINT,
  "SST"          NUMERIC,
  "CE"           VARCHAR,
  "DD"           SMALLINT,
  "CR"           VARCHAR,
  "TR"           NUMERIC,
  "PA"           NUMERIC,
  "AR"           NUMERIC,
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
    r.d_post                     AS "D",
    r.s_post                     AS "S",
    r.ire_dias                   AS "IRE",
    r.sst                        AS "SST",
    r.ce                         AS "CE",
    r.dd                         AS "DD",
    r.cr                         AS "CR",
    r.tr                         AS "TR",
    r.pa                         AS "PA",
    r.ar                         AS "AR",
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

-- ── 3. Eliminar las columnas retiradas (ya nada las referencia) ──
ALTER TABLE respuesta
  DROP COLUMN IF EXISTS to_rate,
  DROP COLUMN IF EXISTS r_post,
  DROP COLUMN IF EXISTS elc;
