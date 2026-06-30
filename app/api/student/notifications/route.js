import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// GET: preferencias de recordatorio del alumno.
async function get(request, context, user) {
  try {
    const { data, error } = await supabase
      .from('usuario')
      .select('recordatorio_activo, recordatorio_hora')
      .eq('id_usuario', user.id)
      .single();
    if (error) throw error;
    return NextResponse.json({
      activo: data?.recordatorio_activo ?? true,
      hora:   data?.recordatorio_hora ?? 19,
    });
  } catch (err) {
    return handleError(err);
  }
}

// PUT: actualizar preferencias (hora 0–23, activo boolean).
async function put(request, context, user) {
  try {
    const body = await request.json();
    const cambios = {};
    if (typeof body.activo === 'boolean') cambios.recordatorio_activo = body.activo;
    if (Number.isInteger(body.hora) && body.hora >= 0 && body.hora <= 23) {
      cambios.recordatorio_hora = body.hora;
    }
    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar', code: 'NO_CHANGES' }, { status: 400 });
    }
    const { error } = await supabase.from('usuario').update(cambios).eq('id_usuario', user.id);
    if (error) throw error;
    return NextResponse.json({ message: 'Preferencias actualizadas', ...cambios });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(get, 'estudiante');
export const PUT = withAuth(put, 'estudiante');
