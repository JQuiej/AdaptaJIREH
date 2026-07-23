-- ============================================================
-- AdaptaJIREH — Reinicio del GRUPO EXPERIMENTAL (40 estudiantes)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- QUÉ HACE (y qué NO hace):
--   ✔ CONSERVA intactos: docentes, administrador, materias, unidades,
--     temas/teoría e ítems (todo el contenido de estudio).
--   ✔ BORRA solo los datos de los ESTUDIANTES: repasos (item_fsrs),
--     sesiones, respuestas, retroalimentación, inscripciones,
--     suscripciones push y días sin pendientes. (Se limpian por CASCADE
--     al eliminar a los estudiantes.)
--   ✔ CREA 40 estudiantes anónimos (est001..est040), cada uno con una
--     CONTRASEÑA DISTINTA y 'debe_cambiar_clave = TRUE', para que al
--     entrar puedan mantener la que se les dio o poner la suya.
--   ✔ Inscribe a cada estudiante en TODAS las materias existentes y les
--     arma una cola de repaso limpia con todos los ítems.
--
--   NO se guardan nombres reales en la BD (anonimización). El mapeo
--   nombre → usuario → contraseña se entrega aparte (fuera de la BD).
--
-- ⚠ DESTRUCTIVO para los datos de estudiantes. Haz respaldo si tenías
--   respuestas/sesiones previas que quieras analizar.
-- ============================================================

BEGIN;

-- ── 1. Eliminar TODOS los estudiantes actuales ───────────────
--    El ON DELETE CASCADE limpia item_fsrs, sesion, respuesta,
--    retroalimentacion, inscripcion, push_subscription y
--    dia_sin_pendientes. Docentes, admin, materias, unidades,
--    ítems y teoría NO se tocan.
DELETE FROM usuario WHERE rol = 'estudiante';

-- ── 2. Crear los 40 estudiantes con contraseñas distintas ────
DO $$
DECLARE
  v_est UUID;
  r     RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('EST-001', 'est001', '$2a$10$4rfZgLp4bgjP7HkfP/U7x.aHrtfKtCOIIqXbo0AH56WUhlSpxChXy'),
      ('EST-002', 'est002', '$2a$10$d6LnERl/L8YmCi.IKNrgvOXkHx5NAOJdZRdp.9aC3.LiIlGCENHMK'),
      ('EST-003', 'est003', '$2a$10$QjKRoWUtirrJ5XrXz8MWBOxdLqCXIbxyHT4uI/Lja7ZFhVFn5OE0q'),
      ('EST-004', 'est004', '$2a$10$FKWZpfU32gcNIsy.2.9JkOzi1qlTMedP9XODzwUvlWvx5uJ7xlwMa'),
      ('EST-005', 'est005', '$2a$10$BQLbXdPiDsDA01/qsXvf/.DF8II20uVCzh2AT6ySGYPspb4Y3rzQW'),
      ('EST-006', 'est006', '$2a$10$o/5t6KIIwgfjQvZ/W7jr9.4uqmBbkAtZn8I4cjU/cq1eB28pa/YAC'),
      ('EST-007', 'est007', '$2a$10$Ffc4P3vkUzUEsRvhuWRJcugFOhKnlYd3Ha9Fv/kk2kmYqKBv3EFTK'),
      ('EST-008', 'est008', '$2a$10$XTrNd2t5CqPbZq.nkHZcYur.aXhjDD/olM/9nOvjoulkfD2AL6dsO'),
      ('EST-009', 'est009', '$2a$10$YidgvgTu1imEMElpPVl/Luwr1k42Pt.NG8theP.XdgFDZfsTIJg8S'),
      ('EST-010', 'est010', '$2a$10$18Te4VDdFVbTPppkm1Z6Z.J4jtVGJlShaM9FSs0HrunXttgSKwl56'),
      ('EST-011', 'est011', '$2a$10$oziZkKcSN0GOVInAcIaSWuGuP2wTOITHsgev24mITe3TMXMMNHAgO'),
      ('EST-012', 'est012', '$2a$10$/kqCvmxXusFF8jreEchpX./WqXqlF9QF92svOub6ioLNci6jo1bRS'),
      ('EST-013', 'est013', '$2a$10$FsoUBPbxV25qXNgiZjvOjOZTWHFle.ytKIwEdx3Z/lhNwUN8qFXoS'),
      ('EST-014', 'est014', '$2a$10$cCj3N1FNJ1qVD52dPRHtlexNvE2Fly5kW0rUgji9OQS81M7ylI4EC'),
      ('EST-015', 'est015', '$2a$10$uER8gh5MF7e5xqkKStjIV.fPtXTBLofjS576rHhaNJYrLrHSGdG4i'),
      ('EST-016', 'est016', '$2a$10$6qU9TEVPaFN28Vdx14./iu5Yom2b/B/huf1qpksb7oZz15vB9oX5K'),
      ('EST-017', 'est017', '$2a$10$.S/sZtJdQ7sBDPl1O0AYZOa0qgZDha7XbVPgC/bG0/LwGwPuC/XN6'),
      ('EST-018', 'est018', '$2a$10$9usMdTD4u7ro6vjvsfMGI.OSAHubFQ1Yqy1obH6N0nS.5MVcR2q5K'),
      ('EST-019', 'est019', '$2a$10$2fgLwICb.LY7mC9cGSQQ7uEENB9e7LZ7dpLGT7Fr5KIOwZMqsCKdS'),
      ('EST-020', 'est020', '$2a$10$E8iXLpkQOf9AALjfWmQ/hemDOQHkY2lzk9TPh3endO9aE0JCJ.BUi'),
      ('EST-021', 'est021', '$2a$10$t1LTAxFXGHiW.InfW8UvquzWicm1T7cDEDxpKhTa0wEzCd1KzC/yK'),
      ('EST-022', 'est022', '$2a$10$xOeL2RSdWwoyG/EVtU4V9eUh2caRl3jXtgR.hHwoj.GEDVar.b40i'),
      ('EST-023', 'est023', '$2a$10$gotGcxE3OcFly/vwS.g.TeSr5G.ljl9J0mXQ6y/VxOxa20eX1JjLu'),
      ('EST-024', 'est024', '$2a$10$AptijXAqdqW8gQG81qhIBOtNk1T6k1OcnJKWSwAXjz1nDt5fQukUq'),
      ('EST-025', 'est025', '$2a$10$RWIcD4RaUQ8BW47.1yC9d.WGsyU7OWdOaVhFkJ4.D3shVcl.YL8ey'),
      ('EST-026', 'est026', '$2a$10$eKe4u7fAtV/cQo/11Q0hUuDD9Ef3HVbvOLKQ0MT6o4rAJ88kMBW3a'),
      ('EST-027', 'est027', '$2a$10$gTnFPtCRM2jZnFg1s2BHT.jnWe6xceOKq0wr9Q2dbuPr.eOoeO2AC'),
      ('EST-028', 'est028', '$2a$10$pk2UOouBcE20WxJRl.6d9ODVfkdq2unn8rBGAxhlUqCwXUqHkaSk2'),
      ('EST-029', 'est029', '$2a$10$5jX8KX/VGhXO0SDuM5GINuaIguSGMvBX4Vwo6teUETiiKay6taAD6'),
      ('EST-030', 'est030', '$2a$10$chlECCuCJixaQBiKZHPWpuB3woQQvwK3ArjMKRwlWcZAfSfND6S7.'),
      ('EST-031', 'est031', '$2a$10$3zcuvqIOVYbi.iDnjtan.eU9FKmOJnECN5XeaoLtjQYQcW3S7i8Oa'),
      ('EST-032', 'est032', '$2a$10$BI92yPL1Jw1SvEMQvZCwUeMCI4YIvYXYGbQqL99Qcw1.vX1sahvQi'),
      ('EST-033', 'est033', '$2a$10$NiUfJIHdSQtvheWAo4m4PuKTYiw6omO0BZu1BRkImUUDjuARxellu'),
      ('EST-034', 'est034', '$2a$10$HcRxMOYAV/ZcJ6G.Nvh9ZegQ9TuM0RcSzk9ZzKPQOwFWLbqgRhBpG'),
      ('EST-035', 'est035', '$2a$10$Q/ikgxArc.FmmuorihRU.eRzkc.jIokUah4VSElJSSzlBJTJToCQS'),
      ('EST-036', 'est036', '$2a$10$QanBebyzeqcyiNEyqV1gJ.lZgS1jkdRgzoZcmppECUylFHSU3Uf2G'),
      ('EST-037', 'est037', '$2a$10$VLyoc/0KLi1Ddax/7kAOfeY5Amd26OL6/igxY1TURlEY0EW0cyMd2'),
      ('EST-038', 'est038', '$2a$10$VOW6v5yN02TbgA163nW0UOQyR8OYROvussS6itg7EIvjgMvJgOc92'),
      ('EST-039', 'est039', '$2a$10$Tarzi5Epqa3wSobaMFixu.mBB4YVh9dxvQI6cXl2wSOvTkAPv89zS'),
      ('EST-040', 'est040', '$2a$10$MZdPcNXt0btYR.fkQZWuMO2sIQ4eU5cREJxyRRMonV6YDPHZzrTNC')
    ) AS t(codigo, usuario, hash)
  LOOP
    -- Crear el estudiante (debe_cambiar_clave = TRUE → al entrar podrá
    -- mantener la clave dada o poner la suya).
    INSERT INTO usuario
      (codigo_anonimo, nombre_usuario, clave_hash, rol, grado, debe_cambiar_clave)
    VALUES
      (r.codigo, r.usuario, r.hash, 'estudiante', '5to Bachillerato', TRUE)
    RETURNING id_usuario INTO v_est;

    -- Inscribir en TODAS las materias existentes.
    INSERT INTO inscripcion (id_estudiante, id_materia)
    SELECT v_est, id_materia FROM materia;

    -- Cola de repaso limpia: un registro FSRS por cada ítem.
    INSERT INTO item_fsrs (id_item, id_estudiante)
    SELECT id_item, v_est FROM item;
  END LOOP;
END $$;

-- ── 3. Verificación rápida ───────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM usuario WHERE rol = 'estudiante')                       AS estudiantes,
  (SELECT COUNT(*) FROM usuario WHERE rol = 'estudiante' AND debe_cambiar_clave) AS con_clave_por_defecto,
  (SELECT COUNT(*) FROM usuario WHERE rol = 'docente')                          AS docentes,
  (SELECT COUNT(*) FROM materia)                                                AS materias,
  (SELECT COUNT(*) FROM item)                                                   AS items_conservados,
  (SELECT COUNT(*) FROM inscripcion)                                            AS inscripciones,
  (SELECT COUNT(*) FROM item_fsrs)                                              AS repasos_asignados;

COMMIT;
