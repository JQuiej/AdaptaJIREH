-- ============================================================
-- AdaptaJIREH — Migración 020: Las 10 variables de la tesis,
--               AGREGADAS Y CLASIFICADAS por estudiante (una fila por alumno)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 019)
--
-- QUÉ HACE:
--   Entrega UNA fila por estudiante con SUS 10 variables (ni una más), cada una
--   con su valor agregado y su CATEGORÍA (0/1/2/3) según los rangos de la matriz
--   de operacionalización. No crea variables nuevas: solo agrega y clasifica el
--   dato crudo que ya vive en `respuesta` / `sesion`.
--
--   Reemplaza las funciones sueltas de la migración 019 (per-sesión / resumen),
--   que quedaron descartadas al elegir "una fila por estudiante".
--
-- ESCALAS Y CORTES (tal como los calcula el sistema):
--   TR  proporción de aciertos en ítems de transferencia (Bloom 3/4):
--         0:≤0.40 baja · 1:≤0.70 media · 2:>0.70 alta
--   IRE intervalo medio en días:
--         0:≤3 corto · 1:≤7 medio · 2:≤14 largo · 3:>14 extendido
--   D   dificultad FSRS en ESCALA 1–10 (nativa del sistema, NO 0–1):
--         0:≤4 baja · 1:≤7 media · 2:>7 alta
--   S   estabilidad media en días:
--         0:≤7 baja · 1:≤21 media · 2:≤60 alta · 3:>60 muy alta
--   PA  proporción de aciertos en primer intento (sin pista):
--         0:≤0.50 baja · 1:≤0.80 media · 2:>0.80 alta
--   SST similitud semántica media [0,1]:
--         0:≤0.40 baja · 1:≤0.70 media · 2:>0.70 alta
--   AR  proporción de repasos programados hechos a tiempo (excluye 1ª exposición):
--         0:≤0.60 baja · 1:≤0.85 media · 2:>0.85 alta
--   CE  carga por sesión según ÍTEMS y TIEMPO (matriz de la tesis); la categoría
--       es la más exigente de las dos (GREATEST):
--         ítems:  0:<10 · 1:10–20 · 2:>20
--         minutos:0:<10 · 1:10–20 · 2:>20
--   DD  nivel de Bloom promedio (1–4):
--         cat 0:N1 · 1:N2 · 2:N3 · 3:N4   (cat = ROUND(nivel) − 1)
--   LR  latencia media en segundos:
--         0:<15 rápida · 1:≤45 media · 2:>45 lenta
-- ============================================================

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
