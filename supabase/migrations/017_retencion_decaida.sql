-- ============================================================
-- AdaptaJIREH — Migración 017: Retención decaída (medida interna de la
--                              variable DEPENDIENTE «Retención Cognitiva»)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 016)
--
-- QUÉ HACE:
--   Agrega a `respuesta` la medida conductual de retención que el sistema
--   calculaba y DESCARTABA en cada repaso:
--
--   · retencion_decaida — R(t) de FSRS al MOMENTO del repaso, es decir, la
--     probabilidad de recuperación decaída por los días transcurridos desde
--     el último repaso (calculateRetrieval(S_prev, días)). Es la medida
--     interna de la variable dependiente de la tesis: cuánto retuvo el
--     alumno ANTES de volver a ver el ítem. NULL en el primer repaso
--     (sin repaso previo no hay olvido que medir).
--
--   · dias_desde_repaso — días transcurridos desde el último repaso del
--     ítem. Sin este dato la retención no es interpretable (una R=0.6 a los
--     2 días y una R=0.6 a los 20 días son fenómenos distintos). NULL en el
--     primer repaso.
--
-- QUÉ NO ES:
--   NO revive la variable independiente r_post eliminada en la migración
--   007 (aquella era la R≈1 POST-repaso, sin varianza). Esta es la R
--   PRE-repaso, con varianza real, y es medida de la VARIABLE DEPENDIENTE,
--   no una independiente. Las 10 independientes no cambian:
--   D, S, IRE, SST, CE, DD, TR, PA, AR, LR.
--
-- IMPACTO EN LO EXISTENTE: ninguno. Solo se agregan columnas (las filas
--   históricas quedan NULL) y la exportación CSV gana dos columnas al final.
-- ============================================================

ALTER TABLE respuesta
  ADD COLUMN IF NOT EXISTS retencion_decaida NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS dias_desde_repaso NUMERIC(6,2);

-- ── Exportación CSV: se agregan RETENCION (DV) y DIAS_DESDE_REPASO ──
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
  "RETENCION"    NUMERIC,   -- variable DEPENDIENTE (retención decaída pre-repaso)
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
    r.retencion_decaida          AS "RETENCION",
    r.dias_desde_repaso          AS "DIAS_DESDE_REPASO",
    r.uso_pista                  AS "USO_PISTA",
    r.cr                         AS cr_descriptiva,     -- descriptiva, no del modelo
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
