import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

// Contraseña por defecto que se asigna al crear un alumno o al restablecer su
// clave. Cuando un usuario todavía la tiene, 'debe_cambiar_clave' está en TRUE
// y al iniciar sesión se le ofrece cambiarla.
export const CLAVE_POR_DEFECTO = 'jireh2024';

/** Longitud mínima aceptada para una contraseña nueva. */
export const CLAVE_MIN = 4;

/** Genera el hash bcrypt de una contraseña (10 rondas, igual que el seed). */
export async function hashClave(clave) {
  return bcrypt.hash(String(clave), 10);
}

/**
 * Devuelve el siguiente código anónimo correlativo del tipo «EST-001», sin
 * colisionar con los existentes. El código es obligatorio y único en la BD.
 * Prefijos: EST (estudiante), DOC (docente), ADM (administrador).
 */
export async function siguienteCodigoAnonimo(prefijo = 'EST') {
  const { data } = await supabase
    .from('usuario')
    .select('codigo_anonimo')
    .ilike('codigo_anonimo', `${prefijo}-%`);

  let max = 0;
  for (const u of data ?? []) {
    const m = /(\d+)\s*$/.exec(u.codigo_anonimo ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Asigna a un estudiante TODOS los ítems de una materia (crea sus registros
 * item_fsrs) para que entren a su cola de repaso. Idempotente: no duplica los
 * que ya existan. Devuelve cuántos ítems tiene la materia.
 *
 * Es el paso que faltaba: inscribir en `inscripcion` no bastaba, porque la cola
 * de repaso (endpoint /fsrs/pending) se arma desde item_fsrs, no desde la
 * inscripción.
 */
export async function asignarItemsDeMateria(studentId, materiaId) {
  // Ítems de la materia (a través de sus unidades curriculares).
  const { data: unidades } = await supabase
    .from('unidad_curricular')
    .select('id_unidad')
    .eq('id_materia', materiaId);
  const unitIds = (unidades ?? []).map((u) => u.id_unidad);
  if (!unitIds.length) return 0;

  const { data: items } = await supabase
    .from('item')
    .select('id_item')
    .in('id_unidad', unitIds);
  if (!items?.length) return 0;

  await supabase.from('item_fsrs').upsert(
    items.map((it) => ({ id_item: it.id_item, id_estudiante: studentId })),
    { onConflict: 'id_item,id_estudiante', ignoreDuplicates: true }
  );
  return items.length;
}

/**
 * Inscribe a un estudiante en una materia y le asigna todos sus ítems para el
 * repaso. Idempotente en ambas tablas. Devuelve el nº de ítems asignados.
 */
export async function inscribirEnMateria(studentId, materiaId) {
  await supabase
    .from('inscripcion')
    .upsert(
      { id_estudiante: studentId, id_materia: materiaId },
      { onConflict: 'id_estudiante,id_materia', ignoreDuplicates: true }
    );
  return asignarItemsDeMateria(studentId, materiaId);
}

/**
 * Quita a un estudiante de una materia: elimina la inscripción y todos los
 * item_fsrs de los ítems de esa materia (borra su avance en la materia). Las
 * respuestas históricas NO se tocan (quedan para el análisis de investigación).
 */
export async function desinscribirDeMateria(studentId, materiaId) {
  const { data: unidades } = await supabase
    .from('unidad_curricular')
    .select('id_unidad')
    .eq('id_materia', materiaId);
  const unitIds = (unidades ?? []).map((u) => u.id_unidad);

  if (unitIds.length) {
    const { data: items } = await supabase
      .from('item')
      .select('id_item')
      .in('id_unidad', unitIds);
    const itemIds = (items ?? []).map((i) => i.id_item);
    if (itemIds.length) {
      await supabase
        .from('item_fsrs')
        .delete()
        .eq('id_estudiante', studentId)
        .in('id_item', itemIds);
    }
  }

  await supabase
    .from('inscripcion')
    .delete()
    .eq('id_estudiante', studentId)
    .eq('id_materia', materiaId);
}
