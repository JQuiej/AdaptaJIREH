-- ============================================================
-- AdaptaJIREH — Migración 021: Corrige el etiquetado de la exportación CSV
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 020)
--
-- QUÉ CORRIGE:
--   En export_research_csv la columna `nro_sesion` NO era el número de sesión:
--   era un ROW_NUMBER() por RESPUESTA (1,2,3… por cada ítem), así que no
--   permitía agrupar por sesión. Esta migración:
--     · renombra ese contador a `nro_respuesta` (lo que realmente es), y
--     · agrega un `nro_sesion` REAL: el orden de la sesión (tanda de repaso)
--       dentro de cada estudiante, calculado con DENSE_RANK sobre hora_inicio
--       (todas las respuestas de la misma sesión comparten el mismo número).
--   También se incluye `id_sesion` por si se quiere unir/agrupar sin ambigüedad.
--
--   No cambia ninguna variable de investigación; solo el etiquetado/estructura
--   de la exportación.
-- ============================================================

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
  id_sesion      UUID,
  nro_sesion     BIGINT,     -- número de la SESIÓN (tanda) por estudiante
  nro_respuesta  BIGINT,     -- número de la RESPUESTA (ítem) por estudiante
  "D"            NUMERIC,
  "S"            NUMERIC,
  "IRE"          SMALLINT,
  "SST"          NUMERIC,
  "CE"           VARCHAR,
  "DD"           SMALLINT,
  "TR"           NUMERIC,
  "PA"           NUMERIC,
  "AR"           NUMERIC,
  "LR"           NUMERIC,
  "RETENCION"    NUMERIC,
  "DIAS_DESDE_REPASO" NUMERIC,
  "USO_PISTA"    BOOLEAN,
  cr_descriptiva VARCHAR,
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
    s.id_sesion,
    DENSE_RANK() OVER (
      PARTITION BY r.id_estudiante
      ORDER BY s.hora_inicio
    )                            AS nro_sesion,
    ROW_NUMBER() OVER (
      PARTITION BY r.id_estudiante
      ORDER BY r.timestamp_resp
    )                            AS nro_respuesta,
    r.d_post                     AS "D",
    r.s_post                     AS "S",
    r.ire_dias                   AS "IRE",
    r.sst                        AS "SST",
    r.ce                         AS "CE",
    r.dd                         AS "DD",
    r.tr                         AS "TR",
    r.pa                         AS "PA",
    r.ar                         AS "AR",
    ROUND(r.tiempo_respuesta_ms / 1000.0, 1) AS "LR",  -- segundos
    r.retencion_decaida          AS "RETENCION",
    r.dias_desde_repaso          AS "DIAS_DESDE_REPASO",
    r.uso_pista                  AS "USO_PISTA",
    r.cr                         AS cr_descriptiva,
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
