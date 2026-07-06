import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { CLAVE_POR_DEFECTO, hashClave } from '@/lib/usuarios';

/**
 * Restablece la contraseña de un estudiante. Si no se envía una contraseña,
 * se usa la contraseña por defecto. En ambos casos se marca 'debe_cambiar_clave'
 * para que se le pida cambiarla al iniciar sesión.
 *
 * Body opcional: { password }
 */
async function handler(request, context, user) {
  try {
    const { id } = context.params;
    const body = await request.json().catch(() => ({}));
    const password = body.password ? String(body.password) : CLAVE_POR_DEFECTO;

    const clave_hash = await hashClave(password);
    const { data, error } = await supabase
      .from('usuario')
      .update({ clave_hash, debe_cambiar_clave: true })
      .eq('id_usuario', id)
      .eq('rol', 'estudiante')
      .select('id_usuario')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Estudiante no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, password });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'docente');
