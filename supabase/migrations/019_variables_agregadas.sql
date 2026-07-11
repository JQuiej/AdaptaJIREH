-- ============================================================
-- AdaptaJIREH — Migración 019: Agregación de PA y AR a nivel de la
--                              operacionalización de la tesis
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 018)
--
-- PROBLEMA QUE RESUELVE:
--   En `respuesta`, PA y AR se guardan como BINARIO 0/1 POR ÍTEM (es el dato
--   crudo correcto: ¿acertó ese ítem al primer intento sin pista? / ¿repasó ese
--   ítem a tiempo?). Pero la tesis define las VARIABLES como PROPORCIONES con
--   rangos baja/media/alta:
--
--     · PA (Precisión en Primer Intento) — proporción POR SESIÓN.
--         baja  0.00–0.50 (0) · media 0.51–0.80 (1) · alta 0.81–1.00 (2)
--     · AR (Adherencia al Repaso)        — proporción POR ESTUDIANTE en toda
--                                          la intervención.
--         baja  0.00–0.60 (0) · media 0.61–0.85 (1) · alta 0.86–1.00 (2)
--
--   Faltaba la capa que convierte los 0/1 atómicos en esas proporciones y su
--   categoría. Esta migración la agrega SIN modificar el dato crudo.
--
-- DECISIONES DE DISEÑO (ajustables):
--   · AR se calcula SOLO sobre repasos programados reales (los que tenían un
--     repaso previo, es decir `dias_desde_repaso IS NOT NULL`). La primera
--     exposición de un ítem no es una "sesión de repaso programada por FSRS-5",
--     así que se excluye para no inflar AR con 1's automáticos.
--   · PA_por_sesión usa TODOS los ítems evaluados de la sesión (primera
--     exposición y repasos), acorde a "ítems respondidos correctamente en el
--     primer intento de la sesión".
-- ============================================================

-- ── 1. PA por SESIÓN ─────────────────────────────────────────
DROP FUNCTION IF EXISTS export_pa_por_sesion(UUID, TIMESTAMPTZ);
CREATE FUNCTION export_pa_por_sesion(
  p_id_materia  UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  codigo_anonimo   VARCHAR,
  grado            VARCHAR,
  materia          VARCHAR,
  id_sesion        UUID,
  fecha            DATE,
  nro_sesion       BIGINT,
  items_evaluados  BIGINT,
  aciertos_1er_int BIGINT,
  "PA"             NUMERIC,   -- proporción [0,1]
  "PA_cat"         SMALLINT,  -- 0 baja · 1 media · 2 alta
  "PA_nivel"       TEXT
)
LANGUAGE sql STABLE AS $$
  WITH por_sesion AS (
    SELECT
      s.id_sesion,
      s.id_estudiante,
      s.fecha,
      s.id_materia,
      COUNT(*)      AS items_evaluados,
      SUM(r.pa)     AS aciertos,
      AVG(r.pa)     AS pa_prop
    FROM sesion s
    JOIN respuesta r ON r.id_sesion = s.id_sesion
    WHERE r.timestamp_resp >= p_fecha_desde
      AND r.pa IS NOT NULL
      AND (p_id_materia IS NULL OR s.id_materia = p_id_materia)
    GROUP BY s.id_sesion, s.id_estudiante, s.fecha, s.id_materia
  )
  SELECT
    u.codigo_anonimo,
    u.grado,
    m.nombre AS materia,
    ps.id_sesion,
    ps.fecha,
    ROW_NUMBER() OVER (
      PARTITION BY ps.id_estudiante
      ORDER BY ps.fecha, ps.id_sesion
    ) AS nro_sesion,
    ps.items_evaluados,
    ps.aciertos::BIGINT AS aciertos_1er_int,
    ROUND(ps.pa_prop, 4) AS "PA",
    (CASE WHEN ps.pa_prop <= 0.50 THEN 0
          WHEN ps.pa_prop <= 0.80 THEN 1
          ELSE 2 END)::SMALLINT AS "PA_cat",
    (CASE WHEN ps.pa_prop <= 0.50 THEN 'baja'
          WHEN ps.pa_prop <= 0.80 THEN 'media'
          ELSE 'alta' END) AS "PA_nivel"
  FROM por_sesion ps
  JOIN usuario u ON u.id_usuario = ps.id_estudiante
  JOIN materia m ON m.id_materia = ps.id_materia
  ORDER BY u.codigo_anonimo, nro_sesion;
$$;

-- ── 2. AR (y PA global) por ESTUDIANTE en la intervención ────
DROP FUNCTION IF EXISTS export_ar_por_estudiante(UUID, TIMESTAMPTZ);
CREATE FUNCTION export_ar_por_estudiante(
  p_id_materia  UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  codigo_anonimo    VARCHAR,
  grado             VARCHAR,
  materia           VARCHAR,
  repasos_program   BIGINT,   -- repasos reales (excluye 1ra exposición)
  repasos_a_tiempo  BIGINT,
  "AR"              NUMERIC,   -- proporción [0,1]
  "AR_cat"          SMALLINT,  -- 0 baja · 1 media · 2 alta
  "AR_nivel"        TEXT,
  items_evaluados   BIGINT,
  "PA_global"       NUMERIC,   -- proporción [0,1] de PA en toda la intervención
  "PA_cat"          SMALLINT,
  "PA_nivel"        TEXT
)
LANGUAGE sql STABLE AS $$
  WITH por_est AS (
    SELECT
      s.id_estudiante,
      s.id_materia,
      -- AR: solo sobre repasos programados reales
      COUNT(*) FILTER (WHERE r.dias_desde_repaso IS NOT NULL)              AS repasos_program,
      SUM(r.ar) FILTER (WHERE r.dias_desde_repaso IS NOT NULL)             AS repasos_a_tiempo,
      AVG(r.ar) FILTER (WHERE r.dias_desde_repaso IS NOT NULL)             AS ar_prop,
      -- PA global del estudiante (todos los ítems evaluados)
      COUNT(*) FILTER (WHERE r.pa IS NOT NULL)                             AS items_evaluados,
      AVG(r.pa) FILTER (WHERE r.pa IS NOT NULL)                            AS pa_prop
    FROM sesion s
    JOIN respuesta r ON r.id_sesion = s.id_sesion
    WHERE r.timestamp_resp >= p_fecha_desde
      AND (p_id_materia IS NULL OR s.id_materia = p_id_materia)
    GROUP BY s.id_estudiante, s.id_materia
  )
  SELECT
    u.codigo_anonimo,
    u.grado,
    m.nombre AS materia,
    pe.repasos_program,
    pe.repasos_a_tiempo::BIGINT,
    ROUND(pe.ar_prop, 4) AS "AR",
    (CASE WHEN pe.ar_prop IS NULL     THEN NULL
          WHEN pe.ar_prop <= 0.60     THEN 0
          WHEN pe.ar_prop <= 0.85     THEN 1
          ELSE 2 END)::SMALLINT AS "AR_cat",
    (CASE WHEN pe.ar_prop IS NULL THEN NULL
          WHEN pe.ar_prop <= 0.60 THEN 'baja'
          WHEN pe.ar_prop <= 0.85 THEN 'media'
          ELSE 'alta' END) AS "AR_nivel",
    pe.items_evaluados,
    ROUND(pe.pa_prop, 4) AS "PA_global",
    (CASE WHEN pe.pa_prop <= 0.50 THEN 0
          WHEN pe.pa_prop <= 0.80 THEN 1
          ELSE 2 END)::SMALLINT AS "PA_cat",
    (CASE WHEN pe.pa_prop <= 0.50 THEN 'baja'
          WHEN pe.pa_prop <= 0.80 THEN 'media'
          ELSE 'alta' END) AS "PA_nivel"
  FROM por_est pe
  JOIN usuario u ON u.id_usuario = pe.id_estudiante
  JOIN materia m ON m.id_materia = pe.id_materia
  ORDER BY u.codigo_anonimo, materia;
$$;

-- ── 3. Resumen de indicadores %PAB/%PAM/%PAA y %ARB/%ARM/%ARA ─
--     (distribución de las CATEGORÍAS entre estudiantes, por materia)
DROP FUNCTION IF EXISTS export_resumen_pa_ar(UUID, TIMESTAMPTZ);
CREATE FUNCTION export_resumen_pa_ar(
  p_id_materia  UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  materia        VARCHAR,
  n_estudiantes  BIGINT,
  "%PAB"         NUMERIC,
  "%PAM"         NUMERIC,
  "%PAA"         NUMERIC,
  "%ARB"         NUMERIC,
  "%ARM"         NUMERIC,
  "%ARA"         NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT * FROM export_ar_por_estudiante(p_id_materia, p_fecha_desde)
  )
  SELECT
    b.materia,
    COUNT(*)                                                                        AS n_estudiantes,
    -- %PA sobre todos los estudiantes (PA_global siempre existe)
    ROUND(100.0 * COUNT(*) FILTER (WHERE b."PA_cat" = 0) / NULLIF(COUNT(*), 0), 1)   AS "%PAB",
    ROUND(100.0 * COUNT(*) FILTER (WHERE b."PA_cat" = 1) / NULLIF(COUNT(*), 0), 1)   AS "%PAM",
    ROUND(100.0 * COUNT(*) FILTER (WHERE b."PA_cat" = 2) / NULLIF(COUNT(*), 0), 1)   AS "%PAA",
    -- %AR sobre los estudiantes que tuvieron al menos un repaso programado
    ROUND(100.0 * COUNT(*) FILTER (WHERE b."AR_cat" = 0)
          / NULLIF(COUNT(*) FILTER (WHERE b."AR_cat" IS NOT NULL), 0), 1)            AS "%ARB",
    ROUND(100.0 * COUNT(*) FILTER (WHERE b."AR_cat" = 1)
          / NULLIF(COUNT(*) FILTER (WHERE b."AR_cat" IS NOT NULL), 0), 1)            AS "%ARM",
    ROUND(100.0 * COUNT(*) FILTER (WHERE b."AR_cat" = 2)
          / NULLIF(COUNT(*) FILTER (WHERE b."AR_cat" IS NOT NULL), 0), 1)            AS "%ARA"
  FROM base b
  GROUP BY b.materia
  ORDER BY b.materia;
$$;
