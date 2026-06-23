import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const subjectId = new URL(request.url).searchParams.get('subjectId');
    if (!subjectId) {
      return NextResponse.json(
        { error: 'subjectId requerido', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, nivel_bloom')
      .eq('id_materia', subjectId)
      .order('nombre');

    if (error) throw error;

    // Normalizar: exponer 'id' para compatibilidad con el frontend
    const result = (data ?? []).map((u) => ({
      id:          u.id_unidad,
      nombre:      u.nombre,
      nivel_bloom: u.nivel_bloom,
    }));

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
