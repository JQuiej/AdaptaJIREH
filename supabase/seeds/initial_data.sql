-- =============================================================
-- AdaptaJIREH — Datos iniciales de prueba
-- Materias: Matemáticas e Inglés | Solo grupo experimental
-- =============================================================
--
-- ANTES DE EJECUTAR:
--   cd supabase/seeds && node generate-hash.js
-- Copia el hash y reemplaza '$2a$10$YourHashHere' abajo.
-- =============================================================

DO $$
DECLARE
  hash_val TEXT := '$2a$10$P1zNuZPW4CX9nJL76I.kzuWnKrOCtgtRag8EqYnS9XZbpY1LwwBXa'; -- ← output de: node generate-hash.js

  id_docente     UUID := gen_random_uuid();
  id_mat         UUID := gen_random_uuid();
  id_ing         UUID := gen_random_uuid();
  id_algebra     UUID := gen_random_uuid();
  id_geometria   UUID := gen_random_uuid();
  id_estadistica UUID := gen_random_uuid();
  id_grammar     UUID := gen_random_uuid();
  id_vocabulary  UUID := gen_random_uuid();
  id_reading     UUID := gen_random_uuid();

  e1 UUID := gen_random_uuid(); e2  UUID := gen_random_uuid();
  e3 UUID := gen_random_uuid(); e4  UUID := gen_random_uuid();
  e5 UUID := gen_random_uuid(); e6  UUID := gen_random_uuid();
  e7 UUID := gen_random_uuid(); e8  UUID := gen_random_uuid();
  e9 UUID := gen_random_uuid(); e10 UUID := gen_random_uuid();
BEGIN

  -- ── Docente ──────────────────────────────────────────────────
  INSERT INTO usuario (id_usuario, codigo_anonimo, nombre_usuario, clave_hash, rol)
  VALUES (id_docente, 'DOC-01', 'docente01', hash_val, 'docente')
  ON CONFLICT (nombre_usuario) DO NOTHING;

  -- ── Materias ─────────────────────────────────────────────────
  INSERT INTO materia (id_materia, nombre, id_docente, activa) VALUES
    (id_mat, 'Matemáticas', id_docente, TRUE),
    (id_ing, 'Inglés',      id_docente, TRUE)
  ON CONFLICT DO NOTHING;

  -- ── Unidades — Matemáticas ───────────────────────────────────
  INSERT INTO unidad_curricular (id_unidad, id_materia, nombre, nivel_bloom) VALUES
    (id_algebra,     id_mat, 'Álgebra Básica',     2),
    (id_geometria,   id_mat, 'Geometría Plana',    2),
    (id_estadistica, id_mat, 'Estadística Básica', 3)
  ON CONFLICT DO NOTHING;

  -- ── Unidades — Inglés ────────────────────────────────────────
  INSERT INTO unidad_curricular (id_unidad, id_materia, nombre, nivel_bloom) VALUES
    (id_grammar,    id_ing, 'Grammar: Present & Past Tense', 1),
    (id_vocabulary, id_ing, 'Vocabulary',                    1),
    (id_reading,    id_ing, 'Reading Comprehension',         2)
  ON CONFLICT DO NOTHING;

  -- ── Estudiantes experimentales ───────────────────────────────
  INSERT INTO usuario (id_usuario, codigo_anonimo, nombre_usuario, clave_hash, rol, grado) VALUES
    (e1,  'EXP-01', 'est001', hash_val, 'estudiante', '1ro Básico'),
    (e2,  'EXP-02', 'est002', hash_val, 'estudiante', '1ro Básico'),
    (e3,  'EXP-03', 'est003', hash_val, 'estudiante', '1ro Básico'),
    (e4,  'EXP-04', 'est004', hash_val, 'estudiante', '1ro Básico'),
    (e5,  'EXP-05', 'est005', hash_val, 'estudiante', '1ro Básico'),
    (e6,  'EXP-06', 'est006', hash_val, 'estudiante', '1ro Básico'),
    (e7,  'EXP-07', 'est007', hash_val, 'estudiante', '1ro Básico'),
    (e8,  'EXP-08', 'est008', hash_val, 'estudiante', '1ro Básico'),
    (e9,  'EXP-09', 'est009', hash_val, 'estudiante', '1ro Básico'),
    (e10, 'EXP-10', 'est010', hash_val, 'estudiante', '1ro Básico')
  ON CONFLICT (nombre_usuario) DO NOTHING;

  -- ── Inscripciones ────────────────────────────────────────────
  INSERT INTO inscripcion (id_estudiante, id_materia) VALUES
    (e1, id_mat),(e1, id_ing),(e2, id_mat),(e2, id_ing),
    (e3, id_mat),(e3, id_ing),(e4, id_mat),(e4, id_ing),
    (e5, id_mat),(e5, id_ing),(e6, id_mat),(e6, id_ing),
    (e7, id_mat),(e7, id_ing),(e8, id_mat),(e8, id_ing),
    (e9, id_mat),(e9, id_ing),(e10,id_mat),(e10,id_ing)
  ON CONFLICT (id_estudiante, id_materia) DO NOTHING;

END $$;
