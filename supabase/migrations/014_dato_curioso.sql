-- ============================================================
-- AdaptaJIREH — Migración 014: Dato curioso diario del estudiante
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 013)
--
-- QUÉ HACE:
--   Guarda UN dato curioso por estudiante y por día, generado con IA a partir
--   de los temas ACTIVOS (visibles) y asignados al alumno. Se muestra una sola
--   vez, la primera vez que el alumno entra ese día (columna `visto`).
-- ============================================================

CREATE TABLE IF NOT EXISTS dato_curioso (
  id_dato       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estudiante UUID        NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  fecha         DATE        NOT NULL DEFAULT CURRENT_DATE,
  texto         TEXT        NOT NULL,
  tema          VARCHAR(150),          -- tema al que se refiere el dato (informativo)
  visto         BOOLEAN     DEFAULT FALSE,
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_estudiante, fecha)         -- un dato por alumno y día
);

CREATE INDEX IF NOT EXISTS idx_dato_curioso_estudiante_fecha
  ON dato_curioso (id_estudiante, fecha);
