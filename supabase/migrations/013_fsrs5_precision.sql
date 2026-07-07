-- ============================================================
-- AdaptaJIREH — Migración 013: Precisión de columnas FSRS-5
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 012)
--
-- PROBLEMA:
--   Los tipos originales no alcanzaban para los valores reales de FSRS-5:
--     · item_fsrs.s  NUMERIC(3,2)  → máx 9.99, pero la estabilidad se mide en
--       días y puede llegar a cientos o miles → DESBORDABA al guardar.
--     · item_fsrs.d  NUMERIC(5,4)  → máx 9.9999, pero la dificultad va de 1 a 10
--       (10.0 no cabía) y su default 0.3 estaba fuera del rango [1,10].
--   Las mismas columnas espejo en `respuesta` (s_post, d_post) tenían el
--   mismo problema y truncaban los datos de investigación.
--
-- SOLUCIÓN:
--   Ampliar los tipos y corregir el default de la dificultad. Los valores
--   existentes (pequeños) se conservan; se recalculan solos en el próximo repaso.
-- ============================================================

-- ── item_fsrs: estado FSRS por ítem y estudiante ─────────────
ALTER TABLE item_fsrs
  ALTER COLUMN s TYPE NUMERIC(8,2),   -- estabilidad en días (hasta ~999999.99)
  ALTER COLUMN d TYPE NUMERIC(4,2),   -- dificultad 1.00 – 10.00
  ALTER COLUMN d SET DEFAULT 5.0;     -- neutro; el 1er repaso fija D₀(rating)
-- R (retenibilidad) es [0,1] → NUMERIC(5,4) sigue siendo suficiente.

-- ── respuesta: columnas espejo para la investigación (SPSS) ──
ALTER TABLE respuesta
  ALTER COLUMN s_post TYPE NUMERIC(8,2),
  ALTER COLUMN d_post TYPE NUMERIC(4,2);
