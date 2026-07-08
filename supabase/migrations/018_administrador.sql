-- ============================================================
-- AdaptaJIREH — Migración 018: Rol ADMINISTRADOR
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 017)
--
-- QUÉ HACE:
--   1. Amplía usuario.rol a VARCHAR(20) ('administrador' no cabía en 10).
--   2. Permite el nuevo rol 'administrador' en la restricción CHECK.
--   3. Crea el usuario administrador inicial:
--        usuario:    admin
--        contraseña: jireh2024   (se le pedirá cambiarla al entrar)
--
-- El administrador gestiona docentes y alumnos, restablece contraseñas y
-- asigna alumnos a materias (asignándoles automáticamente todos los ítems de
-- la materia para el repaso).
-- ============================================================

-- 1. Ampliar el tamaño de la columna rol.
ALTER TABLE usuario ALTER COLUMN rol TYPE VARCHAR(20);

-- 2. Actualizar la restricción de valores permitidos.
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_rol_check;
ALTER TABLE usuario ADD  CONSTRAINT usuario_rol_check
  CHECK (rol IN ('docente', 'estudiante', 'administrador'));

-- 3. Crear el administrador inicial (contraseña 'jireh2024', hash bcrypt
--    reutilizado del seed). debe_cambiar_clave = TRUE para forzar el cambio.
INSERT INTO usuario (codigo_anonimo, nombre_usuario, clave_hash, rol, debe_cambiar_clave)
VALUES (
  'ADM-01',
  'admin',
  '$2a$10$P1zNuZPW4CX9nJL76I.kzuWnKrOCtgtRag8EqYnS9XZbpY1LwwBXa',
  'administrador',
  TRUE
)
ON CONFLICT (nombre_usuario) DO NOTHING;
