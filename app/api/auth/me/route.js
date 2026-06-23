import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const { data, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_usuario, rol, grado, codigo_anonimo')
      .eq('id_usuario', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Usuario no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Normalizar al contrato JWT estándar
    return NextResponse.json({
      id:              data.id_usuario,
      username:        data.nombre_usuario,
      role:            data.rol,
      grade:           data.grado,
      codigo_anonimo:  data.codigo_anonimo,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler);
