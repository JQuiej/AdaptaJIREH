import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { hashClave, CLAVE_MIN } from '@/lib/usuarios';

/**
 * Cambia la contraseña del usuario autenticado, o simplemente descarta el aviso
 * de «cambia tu contraseña por defecto» si decide mantener la actual.
 *
 * Body:
 *   { newPassword }  → cambia la contraseña y quita el aviso.
 *   { keep: true }   → mantiene la contraseña actual y quita el aviso.
 */
async function handler(request, context, user) {
  try {
    const body = await request.json().catch(() => ({}));

    // El usuario decide mantener su contraseña actual: solo quitamos el aviso.
    if (body.keep) {
      const { error } = await supabase
        .from('usuario')
        .update({ debe_cambiar_clave: false })
        .eq('id_usuario', user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, mustChangePassword: false });
    }

    const newPassword = String(body.newPassword ?? '');
    if (newPassword.length < CLAVE_MIN) {
      return NextResponse.json(
        { error: `La contraseña debe tener al menos ${CLAVE_MIN} caracteres`, code: 'INVALID' },
        { status: 400 }
      );
    }

    const clave_hash = await hashClave(newPassword);
    const { error } = await supabase
      .from('usuario')
      .update({ clave_hash, debe_cambiar_clave: false })
      .eq('id_usuario', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, mustChangePassword: false });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler);
