import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// Lista TODAS las materias (para asignar alumnos). El administrador ve todas,
// no solo las de un docente. Incluye el nombre del docente responsable.
async function handler() {
  try {
    const { data, error } = await supabase
      .from('materia')
      .select('id_materia, nombre, activa, docente:usuario!id_docente(nombre_usuario)')
      .order('nombre');
    if (error) throw error;

    return NextResponse.json(
      (data ?? []).map((m) => ({
        id:      m.id_materia,
        nombre:  m.nombre,
        activa:  m.activa,
        docente: m.docente?.nombre_usuario ?? null,
      }))
    );
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'administrador');
