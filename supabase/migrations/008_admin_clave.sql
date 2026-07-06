-- ============================================================
-- AdaptaJIREH — Migración 008: gestión de usuarios y contraseña por defecto
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- QUÉ HACE:
--   1. Agrega la columna 'debe_cambiar_clave' a usuario. Cuando es TRUE, al
--      iniciar sesión se le ofrece al usuario cambiar su contraseña por defecto
--      (o mantenerla). El panel de administración del docente la usa para crear
--      alumnos con contraseña por defecto y para restablecer contraseñas.
--   2. Marca a los estudiantes existentes para que se les pida cambiar su clave
--      por defecto (jireh2024) la próxima vez que inicien sesión.
-- ============================================================

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE;

-- Pedir el cambio de clave por defecto solo a los estudiantes ya existentes.
UPDATE usuario SET debe_cambiar_clave = TRUE WHERE rol = 'estudiante';
