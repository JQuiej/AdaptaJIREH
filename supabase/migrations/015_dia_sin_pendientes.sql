-- ============================================================
-- AdaptaJIREH — Migración 015: Días sin pendientes (racha)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 014)
--
-- QUÉ HACE:
--   Registra los días en que un alumno NO tenía nada que repasar (0 ítems
--   vencidos o nuevos disponibles). Esos «días de descanso» NO deben romper la
--   racha: al no depender del alumno, se cuentan como cumplidos para no
--   penalizar cuando el sistema no le presenta ítems.
--
--   El registro lo hace estadoRacha() (lib/streak.js) el mismo día en que
--   detecta capacidad 0, tanto al abrir la app como desde el cron diario de
--   recordatorios. Por eso debe quedar guardado ese día, para que al día
--   siguiente la racha pueda «puentear» sobre él.
-- ============================================================

CREATE TABLE IF NOT EXISTS dia_sin_pendientes (
  id_estudiante UUID NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  fecha         DATE NOT NULL,               -- fecha local de Guatemala (YYYY-MM-DD)
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_estudiante, fecha)         -- un registro por alumno y día
);

CREATE INDEX IF NOT EXISTS idx_dia_sin_pendientes_estudiante
  ON dia_sin_pendientes (id_estudiante);
