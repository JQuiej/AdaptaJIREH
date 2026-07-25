-- ============================================================
-- AdaptaJIREH — Porcentaje de uso de la aplicación por estudiante
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Idea: mide la CONSTANCIA de uso. Toma el rango de días desde la PRIMERA
-- respuesta hasta HOY (ambos inclusive) y calcula qué proporción de esos días
-- el estudiante realmente respondió al menos un ítem. Los días que dejó de
-- entrar —incluidos los recientes hasta hoy— cuentan como inactivos y bajan el
-- porcentaje.
--
--   dias_transcurridos = (hoy − primera fecha) + 1            (calendario completo hasta hoy)
--   dias_activos       = días distintos con al menos una respuesta
--   dias_inactivos     = dias_transcurridos − dias_activos
--   porcentaje_uso     = dias_activos / dias_transcurridos * 100
--
-- Las fechas se calculan en hora de Guatemala para que un repaso a las 11 pm
-- no cuente como el día siguiente (UTC).
--
-- Para ver UN solo estudiante, quita el comentario de la línea del WHERE.
-- ============================================================

WITH dias AS (
  SELECT
    r.id_estudiante,
    (r.timestamp_resp AT TIME ZONE 'America/Guatemala')::date AS dia
  FROM respuesta r
),
agg AS (
  SELECT
    id_estudiante,
    MIN(dia)                    AS primera_fecha,
    MAX(dia)                    AS ultima_fecha,
    COUNT(DISTINCT dia)         AS dias_activos,
    -- Rango desde el primer día de uso HASTA HOY (hora de Guatemala), inclusive.
    ((now() AT TIME ZONE 'America/Guatemala')::date - MIN(dia)) + 1 AS dias_transcurridos,
    COUNT(*)                    AS total_respuestas
  FROM dias
  GROUP BY id_estudiante
)
SELECT
  u.codigo_anonimo,
  u.grado,
  a.primera_fecha,
  a.ultima_fecha,
  a.dias_transcurridos,
  a.dias_activos,
  (a.dias_transcurridos - a.dias_activos)                    AS dias_inactivos,
  a.total_respuestas,
  ROUND(100.0 * a.dias_activos / a.dias_transcurridos, 1)    AS porcentaje_uso
FROM agg a
JOIN usuario u ON u.id_usuario = a.id_estudiante
WHERE u.rol = 'estudiante'
  -- AND u.codigo_anonimo = 'CODIGO_AQUI'   -- ← descomenta para un solo estudiante
ORDER BY porcentaje_uso DESC, a.dias_activos DESC;
