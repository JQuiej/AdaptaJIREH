-- ============================================================
-- AdaptaJIREH — Migración 011: registro del uso de pista
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 010)
--
-- QUÉ HACE:
--   1. Agrega la columna 'uso_pista' a respuesta: TRUE si el alumno reveló la
--      pista antes de responder ese ítem.
--   2. Regla de PA (Precisión en Primer Intento): PA se define "sin pista previa".
--      Por eso, cuando el alumno usa la pista, PA se registra como 0 aunque
--      acierte (no fue un primer intento sin ayuda). El flag 'uso_pista' queda
--      guardado para poder reanalizar en SPSS si se desea.
--   3. Agrega la columna USO_PISTA a la exportación CSV de investigación.
-- ============================================================

ALTER TABLE respuesta
  ADD COLUMN IF NOT EXISTS uso_pista BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Exportación CSV con la nueva columna USO_PISTA ───────────
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
  "USO_PISTA"    BOOLEAN,
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
    r.uso_pista                  AS "USO_PISTA",
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
