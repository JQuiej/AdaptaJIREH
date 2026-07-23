
-- Limpieza de la 019 (superada por esta función unificada)
DROP FUNCTION IF EXISTS export_pa_por_sesion(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS export_ar_por_estudiante(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS export_resumen_pa_ar(UUID, TIMESTAMPTZ);

DROP FUNCTION IF EXISTS export_variables_por_estudiante(UUID, TIMESTAMPTZ);
CREATE FUNCTION export_variables_por_estudiante(
  p_id_materia  UUID,
  p_fecha_desde TIMESTAMPTZ
)
RETURNS TABLE (
  codigo_anonimo VARCHAR,
  grado          VARCHAR,
  n_sesiones     BIGINT,
  n_respuestas   BIGINT,
  -- 1. TR
  "TR" NUMERIC, "TR_cat" SMALLINT,
  -- 2. IRE
  "IRE" NUMERIC, "IRE_cat" SMALLINT,
  -- 3. D
  "D" NUMERIC, "D_cat" SMALLINT,
  -- 4. S
  "S" NUMERIC, "S_cat" SMALLINT,
  -- 5. PA
  "PA" NUMERIC, "PA_cat" SMALLINT,
  -- 6. SST
  "SST" NUMERIC, "SST_cat" SMALLINT,
  -- 7. AR
  "AR" NUMERIC, "AR_cat" SMALLINT,
  -- 8. CE
  "CE_items" NUMERIC, "CE_min" NUMERIC, "CE_cat" SMALLINT,
  -- 9. DD
  "DD" NUMERIC, "DD_cat" SMALLINT,
  -- 10. LR
  "LR" NUMERIC, "LR_cat" SMALLINT
)
LANGUAGE sql STABLE AS $$
  WITH resp AS (
    SELECT
      s.id_estudiante,
      COUNT(*)                                                   AS n_respuestas,
      AVG(r.tr) FILTER (WHERE r.tr IS NOT NULL)                  AS tr,
      AVG(r.ire_dias)                                            AS ire,
      AVG(r.d_post)                                              AS d,
      AVG(r.s_post)                                              AS s,
      AVG(r.pa)                                                  AS pa,
      AVG(r.sst)                                                 AS sst,
      AVG(r.ar) FILTER (WHERE r.dias_desde_repaso IS NOT NULL)   AS ar,
      AVG(r.dd)                                                  AS dd,
      AVG(r.tiempo_respuesta_ms) / 1000.0                        AS lr_seg
    FROM respuesta r
    JOIN sesion s ON s.id_sesion = r.id_sesion
    WHERE r.timestamp_resp >= p_fecha_desde
      AND (p_id_materia IS NULL OR s.id_materia = p_id_materia)
    GROUP BY s.id_estudiante
  ),
  ses AS (
    SELECT
      s.id_estudiante,
      COUNT(*)             AS n_sesiones,
      AVG(s.total_items)   AS items_prom,
      AVG(s.duracion_min)  AS dur_prom
    FROM sesion s
    WHERE s.hora_inicio >= p_fecha_desde
      AND (p_id_materia IS NULL OR s.id_materia = p_id_materia)
    GROUP BY s.id_estudiante
  )
  SELECT
    u.codigo_anonimo,
    u.grado,
    COALESCE(ses.n_sesiones, 0)   AS n_sesiones,
    resp.n_respuestas,

    -- 1. TR
    ROUND(resp.tr, 4) AS "TR",
    (CASE WHEN resp.tr IS NULL THEN NULL
          WHEN resp.tr <= 0.40 THEN 0 WHEN resp.tr <= 0.70 THEN 1 ELSE 2 END)::SMALLINT AS "TR_cat",
    -- 2. IRE
    ROUND(resp.ire, 2) AS "IRE",
    (CASE WHEN resp.ire <= 3 THEN 0 WHEN resp.ire <= 7 THEN 1 WHEN resp.ire <= 14 THEN 2 ELSE 3 END)::SMALLINT AS "IRE_cat",
    -- 3. D (escala FSRS 1–10)
    ROUND(resp.d, 2) AS "D",
    (CASE WHEN resp.d <= 4 THEN 0 WHEN resp.d <= 7 THEN 1 ELSE 2 END)::SMALLINT AS "D_cat",
    -- 4. S
    ROUND(resp.s, 2) AS "S",
    (CASE WHEN resp.s <= 7 THEN 0 WHEN resp.s <= 21 THEN 1 WHEN resp.s <= 60 THEN 2 ELSE 3 END)::SMALLINT AS "S_cat",
    -- 5. PA
    ROUND(resp.pa, 4) AS "PA",
    (CASE WHEN resp.pa <= 0.50 THEN 0 WHEN resp.pa <= 0.80 THEN 1 ELSE 2 END)::SMALLINT AS "PA_cat",
    -- 6. SST
    ROUND(resp.sst, 4) AS "SST",
    (CASE WHEN resp.sst <= 0.40 THEN 0 WHEN resp.sst <= 0.70 THEN 1 ELSE 2 END)::SMALLINT AS "SST_cat",
    -- 7. AR
    ROUND(resp.ar, 4) AS "AR",
    (CASE WHEN resp.ar IS NULL THEN NULL
          WHEN resp.ar <= 0.60 THEN 0 WHEN resp.ar <= 0.85 THEN 1 ELSE 2 END)::SMALLINT AS "AR_cat",
    -- 8. CE (ítems y minutos promedio por sesión; categoría = la más exigente)
    ROUND(ses.items_prom, 1) AS "CE_items",
    ROUND(ses.dur_prom, 1)   AS "CE_min",
    GREATEST(
      CASE WHEN ses.items_prom IS NULL THEN NULL
           WHEN ses.items_prom < 10 THEN 0 WHEN ses.items_prom <= 20 THEN 1 ELSE 2 END,
      CASE WHEN ses.dur_prom IS NULL THEN NULL
           WHEN ses.dur_prom < 10 THEN 0 WHEN ses.dur_prom <= 20 THEN 1 ELSE 2 END
    )::SMALLINT AS "CE_cat",
    -- 9. DD (nivel de Bloom promedio)
    ROUND(resp.dd, 2) AS "DD",
    (ROUND(resp.dd) - 1)::SMALLINT AS "DD_cat",
    -- 10. LR (segundos)
    ROUND(resp.lr_seg, 1) AS "LR",
    (CASE WHEN resp.lr_seg < 15 THEN 0 WHEN resp.lr_seg <= 45 THEN 1 ELSE 2 END)::SMALLINT AS "LR_cat"
  FROM resp
  JOIN usuario u  ON u.id_usuario   = resp.id_estudiante
  LEFT JOIN ses   ON ses.id_estudiante = resp.id_estudiante
  ORDER BY u.codigo_anonimo;
$$;
