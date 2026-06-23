import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['subjectId']);

    const { data, error } = await supabase
      .from('sesion')
      .insert({ id_estudiante: user.id, id_materia: body.subjectId })
      .select('id_sesion, id_estudiante, id_materia, fecha, hora_inicio')
      .single();

    if (error) throw error;

    // Normalizar id para compatibilidad con el cliente
    return NextResponse.json({ sessionId: data.id_sesion, ...data }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'estudiante');
