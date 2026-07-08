-- ============================================================
-- AdaptaJIREH — Migración 016: LR (Latencia de Respuesta) sustituye a CR
--                              como variable de investigación
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 015)
--
-- QUÉ HACE:
--   Sustituye CR (Calidad de Retroalimentación) por LR (Latencia de
--   Respuesta) en las 10 variables independientes de la tesis y en la
--   exportación CSV de investigación.
--
--   MOTIVO: CR se deriva del mismo puntaje de corrección que PA (mismos
--   umbrales 0.41/0.71), por lo que no aporta información propia al modelo
--   (colinealidad). LR, en cambio, mide la fluidez de recuperación
--   (retrieval fluency): recuperar rápido señala memoria más consolidada.
--   Es continua, con varianza real e independiente del resto.
--
--   LR = tiempo_respuesta_ms / 1000 (segundos, 1 decimal). El dato ya se
--   registra en cada respuesta desde el inicio, así que la variable queda
--   disponible RETROACTIVAMENTE para todo el histórico.
--
-- QUÉ NO CAMBIA:
--   · La columna respuesta.cr se CONSERVA y se sigue registrando: alimenta
--     el módulo de retroalimentación del alumno y puede reportarse
--     descriptivamente. Solo deja de ser variable del modelo estadístico.
--
-- Variables de investigación resultantes (10):
--   D, S, IRE, SST, CE, DD, TR, PA, AR, LR
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
  nro_sesion     BIGINT,
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
    r.tr                         AS "TR",
    r.pa                         AS "PA",
    r.ar                         AS "AR",
    ROUND(r.tiempo_respuesta_ms / 1000.0, 1) AS "LR",  -- segundos
    r.uso_pista                  AS "USO_PISTA",
    r.cr                         AS cr_descriptiva,     -- ya NO es variable del modelo
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
