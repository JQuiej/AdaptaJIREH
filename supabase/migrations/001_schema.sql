-- ============================================================
-- AdaptaJIREH — Migración 001: Esquema inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Todos los nombres de tablas y columnas en español
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── usuario ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_anonimo  VARCHAR(10)  UNIQUE NOT NULL,
  nombre_usuario  VARCHAR(50)  UNIQUE NOT NULL,
  clave_hash      VARCHAR(255) NOT NULL,
  rol             VARCHAR(10)  NOT NULL CHECK (rol IN ('docente', 'estudiante')),
  grado           VARCHAR(30),
  creado_en       TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── materia ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materia (
  id_materia  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(100) NOT NULL,
  id_docente  UUID         REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  activa      BOOLEAN      DEFAULT TRUE
);

-- ─── unidad_curricular ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidad_curricular (
  id_unidad    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_materia   UUID         NOT NULL REFERENCES materia(id_materia) ON DELETE CASCADE,
  nombre       VARCHAR(150) NOT NULL,
  nivel_bloom  INTEGER      NOT NULL CHECK (nivel_bloom BETWEEN 1 AND 4)
);

-- ─── inscripcion ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inscripcion (
  id_inscripcion     UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estudiante      UUID  NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_materia         UUID  NOT NULL REFERENCES materia(id_materia) ON DELETE CASCADE,
  fecha_inscripcion  DATE  DEFAULT CURRENT_DATE,
  UNIQUE (id_estudiante, id_materia)
);

-- ─── item ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item (
  id_item       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  id_unidad     UUID    NOT NULL REFERENCES unidad_curricular(id_unidad) ON DELETE CASCADE,
  nivel_bloom   INTEGER NOT NULL CHECK (nivel_bloom BETWEEN 1 AND 4),
  pregunta      TEXT    NOT NULL,
  respuesta_ref TEXT    NOT NULL,
  pista         TEXT,
  embedding_ref TEXT,              -- vector Gemini serializado (JSON)
  activo        BOOLEAN DEFAULT TRUE,
  creado_en     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── item_fsrs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_fsrs (
  id_registro       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_item           UUID         NOT NULL REFERENCES item(id_item) ON DELETE CASCADE,
  id_estudiante     UUID         NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  D                 NUMERIC(5,4) DEFAULT 0.3,
  S                 NUMERIC(3,2) DEFAULT 1.0,
  R                 NUMERIC(5,4) DEFAULT 1.0,
  proxima_revision  DATE         DEFAULT CURRENT_DATE,
  ultima_revision   TIMESTAMPTZ,
  total_repasos     SMALLINT     DEFAULT 0,
  UNIQUE (id_item, id_estudiante)
);

-- ─── sesion ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesion (
  id_sesion          UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estudiante      UUID   NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_materia         UUID   REFERENCES materia(id_materia) ON DELETE SET NULL,
  fecha              DATE   DEFAULT CURRENT_DATE,
  hora_inicio        TIMESTAMPTZ DEFAULT NOW(),
  hora_fin           TIMESTAMPTZ,
  total_items        SMALLINT DEFAULT 0,
  items_completados  SMALLINT DEFAULT 0,
  duracion_min       NUMERIC(6,2)
);

-- ─── respuesta (variables de investigación) ───────────────────
CREATE TABLE IF NOT EXISTS respuesta (
  id_respuesta       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  id_sesion          UUID    NOT NULL REFERENCES sesion(id_sesion) ON DELETE CASCADE,
  id_item            UUID    NOT NULL REFERENCES item(id_item) ON DELETE CASCADE,
  id_estudiante      UUID    NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  respuesta_texto    TEXT,
  tiempo_respuesta_ms INTEGER,
  timestamp_resp     TIMESTAMPTZ DEFAULT NOW(),

  -- Variables de investigación (FSRS-5 + NLP)
  SST        NUMERIC(5,4),  -- Similitud Semántica Textual [0,1]
  TO_rate    NUMERIC(5,4),  -- Tasa de Olvido
  IRE_dias   SMALLINT,      -- Intervalo de Repetición Espaciada (días)
  D_post     NUMERIC(5,4),  -- Dificultad tras actualizar FSRS
  S_post     NUMERIC(3,2),  -- Estabilidad tras actualizar FSRS
  R_post     NUMERIC(5,4),  -- Retención decaída al momento del repaso (R + TO ≈ 1)
  ELC        NUMERIC(5,4),  -- Estado Latente de Conocimiento
  CE         VARCHAR(6),    -- Carga de Estudio: 'low'|'medium'|'high'
  DD         SMALLINT,      -- Dificultad Deseable (nivel Bloom)
  CR         VARCHAR(12),   -- Calidad de Retroalimentación
  rating_frs SMALLINT       -- Rating FSRS interno (0–4)
);

-- ─── retroalimentacion ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retroalimentacion (
  id_retro     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  id_respuesta UUID    NOT NULL REFERENCES respuesta(id_respuesta) ON DELETE CASCADE,
  diagnostico  TEXT    NOT NULL,
  explicacion  TEXT    NOT NULL,
  ejemplo      TEXT    NOT NULL,
  tipo         VARCHAR(12) NOT NULL CHECK (tipo IN ('generativa', 'explicativa', 'basica')),
  creado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_item_fsrs_estudiante_revision
  ON item_fsrs (id_estudiante, proxima_revision);

CREATE INDEX IF NOT EXISTS idx_respuesta_estudiante_fecha
  ON respuesta (id_estudiante, timestamp_resp DESC);

CREATE INDEX IF NOT EXISTS idx_respuesta_sesion
  ON respuesta (id_sesion);

CREATE INDEX IF NOT EXISTS idx_item_unidad_activo
  ON item (id_unidad, activo);

CREATE INDEX IF NOT EXISTS idx_sesion_estudiante_fecha
  ON sesion (id_estudiante, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inscripcion_estudiante
  ON inscripcion (id_estudiante);
