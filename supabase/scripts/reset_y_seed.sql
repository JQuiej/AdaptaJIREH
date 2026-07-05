-- ============================================================
-- AdaptaJIREH — Reinicio y carga de datos base
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- QUÉ HACE:
--   1. Borra TODO el contenido de estudio (temas, ítems, teoría,
--      sesiones, respuestas, retroalimentación, programaciones FSRS,
--      suscripciones push) y TODOS los usuarios e inscripciones.
--   2. Crea 2 docentes:
--        · docente_ingles → materia «Inglés»
--        · docente_mate   → materia «Matemáticas»
--   3. Crea 39 estudiantes de «5to Bachillerato», inscritos en ambas
--      materias (para que cada docente vea su avance en su dashboard).
--   4. Crea 3 usuarios de prueba independientes (prueba1..3), también
--      inscritos en ambas materias.
--
--   NO crea temas: cada docente los agrega desde «Subir material».
--
-- CONTRASEÑA de todos los usuarios: jireh2024
--   (hash bcrypt reutilizado de supabase/seeds/generate-hash.js)
--
-- ⚠ ESTE SCRIPT ES DESTRUCTIVO. Haz respaldo antes si tienes datos reales.
-- ============================================================

-- ── 1. Limpieza total ────────────────────────────────────────
TRUNCATE
  retroalimentacion,
  respuesta,
  sesion,
  item_fsrs,
  item,
  teoria,
  unidad_curricular,
  inscripcion,
  push_subscription,
  materia,
  usuario
RESTART IDENTITY CASCADE;

-- ── 2-4. Alta de docentes, materias, estudiantes e inscripciones ──
DO $$
DECLARE
  -- Hash bcrypt de la contraseña 'jireh2024'
  hash_val TEXT := '$2a$10$P1zNuZPW4CX9nJL76I.kzuWnKrOCtgtRag8EqYnS9XZbpY1LwwBXa';

  id_doc_ing  UUID := gen_random_uuid();
  id_doc_mate UUID := gen_random_uuid();
  id_ing      UUID := gen_random_uuid();
  id_mat      UUID := gen_random_uuid();

  v_est UUID;
  i     INT;
BEGIN
  -- ── Docentes ───────────────────────────────────────────────
  INSERT INTO usuario (id_usuario, codigo_anonimo, nombre_usuario, clave_hash, rol) VALUES
    (id_doc_ing,  'DOC-ING', 'docente_ingles', hash_val, 'docente'),
    (id_doc_mate, 'DOC-MAT', 'docente_mate',   hash_val, 'docente');

  -- ── Materias (cada una con su docente) ─────────────────────
  INSERT INTO materia (id_materia, nombre, id_docente, activa) VALUES
    (id_ing, 'Inglés',      id_doc_ing,  TRUE),
    (id_mat, 'Matemáticas', id_doc_mate, TRUE);

  -- ── 39 estudiantes de 5to Bachillerato ─────────────────────
  FOR i IN 1..39 LOOP
    v_est := gen_random_uuid();
    INSERT INTO usuario (id_usuario, codigo_anonimo, nombre_usuario, clave_hash, rol, grado)
    VALUES (
      v_est,
      'EST-' || lpad(i::text, 3, '0'),
      'est'  || lpad(i::text, 3, '0'),
      hash_val,
      'estudiante',
      '5to Bachillerato'
    );
    INSERT INTO inscripcion (id_estudiante, id_materia) VALUES
      (v_est, id_ing), (v_est, id_mat);
  END LOOP;

  -- ── 3 usuarios de prueba independientes ────────────────────
  FOR i IN 1..3 LOOP
    v_est := gen_random_uuid();
    INSERT INTO usuario (id_usuario, codigo_anonimo, nombre_usuario, clave_hash, rol, grado)
    VALUES (
      v_est,
      'TEST-' || i,
      'prueba' || i,
      hash_val,
      'estudiante',
      '5to Bachillerato'
    );
    INSERT INTO inscripcion (id_estudiante, id_materia) VALUES
      (v_est, id_ing), (v_est, id_mat);
  END LOOP;
END $$;

-- ── Verificación rápida ──────────────────────────────────────
--   docentes = 2 | estudiantes = 42 | materias = 2 | inscripciones = 84
SELECT
  (SELECT COUNT(*) FROM usuario WHERE rol = 'docente')     AS docentes,
  (SELECT COUNT(*) FROM usuario WHERE rol = 'estudiante')  AS estudiantes,
  (SELECT COUNT(*) FROM materia)                           AS materias,
  (SELECT COUNT(*) FROM inscripcion)                       AS inscripciones;
