-- ============================================================
-- AdaptaJIREH — Migración 023: respuestas de un ítem por estudiante
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 022)
--
-- QUÉ HACE:
--   Crea la función get_item_responses, que devuelve TODAS las respuestas que
--   los estudiantes han dado a un ítem concreto (incluidos los repasos), con la
--   nota que el sistema le dio a cada una. Se usa en el modal «Respuestas» del
--   apartado de ítems del docente.
--
--   SEGURIDAD: solo devuelve datos si el ítem pertenece a una materia del
--   docente que consulta (p_id_docente). Si no es suyo, no devuelve filas.
--
--   La nota: grade_score (punteo exacto del juez) existe desde la migración 022;
--   para respuestas anteriores es NULL y el front reconstruye la banda con
--   rating_frs, igual que en la consulta de respuestas del día.
-- ============================================================

DROP FUNCTION IF EXISTS get_item_responses(UUID, UUID);
CREATE FUNCTION get_item_responses(
  p_id_item    UUID,
  p_id_docente UUID
)
RETURNS TABLE (
  id_respuesta        UUID,
  id_estudiante       UUID,
  codigo_anonimo      VARCHAR,
  grado               VARCHAR,
  respuesta_texto     TEXT,
  timestamp_resp      TIMESTAMPTZ,
  grade_score         NUMERIC,   -- [0,1] nota exacta del juez (NULL en respuestas viejas)
  rating_frs          SMALLINT,  -- 0-4, para reconstruir la banda si grade_score es NULL
  sst                 NUMERIC,   -- similitud por embeddings (referencia interna)
  uso_pista           BOOLEAN,
  tiempo_respuesta_ms INTEGER,
  -- Retroalimentación que se le dio a la respuesta (NULL si no tuvo).
  retro_tipo          VARCHAR,
  retro_diagnostico   TEXT,
  retro_explicacion   TEXT,
  retro_ejemplo       TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT
    r.id_respuesta,
    r.id_estudiante,
    u.codigo_anonimo,
    u.grado,
    r.respuesta_texto,
    r.timestamp_resp,
    r.grade_score,
    r.rating_frs,
    r.sst,
    r.uso_pista,
    r.tiempo_respuesta_ms,
    rt.tipo         AS retro_tipo,
    rt.diagnostico  AS retro_diagnostico,
    rt.explicacion  AS retro_explicacion,
    rt.ejemplo      AS retro_ejemplo
  FROM respuesta r
  JOIN item              i  ON i.id_item     = r.id_item
  JOIN unidad_curricular uc ON uc.id_unidad  = i.id_unidad
  JOIN materia           m  ON m.id_materia  = uc.id_materia
  JOIN usuario           u  ON u.id_usuario  = r.id_estudiante
  LEFT JOIN retroalimentacion rt ON rt.id_respuesta = r.id_respuesta
  WHERE r.id_item = p_id_item
    AND (p_id_docente IS NULL OR m.id_docente = p_id_docente)
  ORDER BY u.codigo_anonimo, r.timestamp_resp;
$$;
