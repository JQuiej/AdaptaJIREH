-- ============================================================
-- AdaptaJIREH — Respuestas del día + retroalimentación por código anónimo
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Muestra, para un estudiante identificado por su código anónimo, todas las
-- respuestas que dio en un día, con la pregunta, su respuesta, la respuesta
-- esperada, la precisión (SST) y la retroalimentación de IA si la tuvo.
--
-- CÓMO USARLO:
--   1) Reemplaza  'CODIGO_AQUI'  por el código anónimo del estudiante.
--   2) Por defecto muestra HOY (hora de Guatemala). Para ver OTRO día,
--      cambia  (now() AT TIME ZONE 'America/Guatemala')::date
--      por     DATE '2026-07-22'   (la fecha que quieras).
-- ============================================================

SELECT
  u.codigo_anonimo,
  u.grado,
  to_char(r.timestamp_resp AT TIME ZONE 'America/Guatemala', 'HH24:MI') AS hora,
  m.nombre                                   AS materia,
  uc.nombre                                  AS unidad,
  it.nivel_bloom,
  it.pregunta,
  r.respuesta_texto                          AS respuesta_estudiante,
  it.respuesta_ref                           AS respuesta_esperada,
  -- Punteo EXACTO que vio el estudiante (grade_score del juez LLM). Solo existe
  -- desde la migración 022; en respuestas anteriores es NULL.
  ROUND(r.grade_score * 100, 1)              AS punteo_visto_pct,
  -- Respaldo para respuestas viejas (grade_score NULL): la BANDA aproximada
  -- reconstruida desde rating_frs, que usa los mismos cortes de pantalla.
  CASE
    WHEN r.grade_score IS NOT NULL THEN NULL   -- ya se muestra el % exacto arriba
    WHEN r.rating_frs = 3 THEN 'Alto (≥71%) — "¡Muy bien!"'
    WHEN r.rating_frs = 2 THEN 'Medio (41–70%) — "Vas por buen camino"'
    ELSE                       'Bajo (<41%) — "A reforzar"'
  END                                        AS punteo_visto_aprox,
  ROUND(r.sst * 100, 1)                      AS similitud_sst_pct,  -- referencia interna (embeddings), NO es lo que ve el alumno
  r.uso_pista,
  ROUND(r.tiempo_respuesta_ms / 1000.0, 1)   AS tiempo_seg,
  rt.tipo                                     AS tipo_retro,     -- NULL si no hubo retro
  rt.diagnostico,
  rt.explicacion,
  rt.ejemplo
FROM usuario u
JOIN respuesta r              ON r.id_estudiante = u.id_usuario
JOIN item it                 ON it.id_item      = r.id_item
JOIN unidad_curricular uc    ON uc.id_unidad    = it.id_unidad
JOIN materia m               ON m.id_materia    = uc.id_materia
LEFT JOIN retroalimentacion rt ON rt.id_respuesta = r.id_respuesta
WHERE u.codigo_anonimo = 'CODIGO_AQUI'
  AND (r.timestamp_resp AT TIME ZONE 'America/Guatemala')::date
      = (now() AT TIME ZONE 'America/Guatemala')::date   -- ← cambia por DATE 'YYYY-MM-DD' para otro día
ORDER BY r.timestamp_resp;
