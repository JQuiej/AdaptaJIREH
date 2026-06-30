-- ============================================================
-- AdaptaJIREH — Migración 005: Racha y notificaciones push
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 004)
-- ============================================================

-- Preferencias de recordatorio por alumno (hora local de Guatemala, 0–23).
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS recordatorio_activo BOOLEAN  DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recordatorio_hora   SMALLINT DEFAULT 19
    CHECK (recordatorio_hora BETWEEN 0 AND 23);

-- Suscripciones Web Push (un alumno puede tener varios dispositivos).
CREATE TABLE IF NOT EXISTS push_subscription (
  id_subscription UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario      UUID NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_usuario ON push_subscription (id_usuario);
