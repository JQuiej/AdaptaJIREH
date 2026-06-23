import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const { data, error } = await supabase
      .from('materia')
      .select('id_materia, nombre, activa')
      .eq('id_docente', user.id)
      .eq('activa', true)
      .order('nombre');

    if (error) throw error;

    // Normalizar: exponer 'id' para compatibilidad con el frontend
    const result = (data ?? []).map((m) => ({
      id:     m.id_materia,
      nombre: m.nombre,
    }));

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
