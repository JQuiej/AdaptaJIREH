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
