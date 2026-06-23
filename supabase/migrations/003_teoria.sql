-- ============================================================
-- AdaptaJIREH — Migración 003: Apuntes de teoría por unidad
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 002)
-- ============================================================

CREATE TABLE IF NOT EXISTS teoria (
  id_teoria   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_unidad   UUID         NOT NULL REFERENCES unidad_curricular(id_unidad) ON DELETE CASCADE,
  resumen     TEXT,
  secciones   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  creado_en   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teoria_unidad ON teoria (id_unidad);
