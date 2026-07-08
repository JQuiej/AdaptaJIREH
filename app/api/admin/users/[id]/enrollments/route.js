import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { inscribirEnMateria, desinscribirDeMateria } from '@/lib/usuarios';

// Verifica que el id corresponda a un estudiante; devuelve true/false.
async function esEstudiante(id) {
  const { data } = await supabase
    .from('usuario').select('rol').eq('id_usuario', id).maybeSingle();
  return data?.rol === 'estudiante';
}

// ── GET: materias en las que está inscrito el estudiante ───────
async function listar(request, context) {
  try {
    const { id } = context.params;
    const { data, error } = await supabase
      .from('inscripcion')
      .select('id_materia')
      .eq('id_estudiante', id);
    if (error) throw error;
    return NextResponse.json((data ?? []).map((i) => i.id_materia));
  } catch (err) {
    return handleError(err);
  }
}

// ── POST: inscribir al estudiante en una materia + asignar ítems ──
async function inscribir(request, context) {
  try {
    const { id } = context.params;
    const body = await request.json();
    requireFields(body, ['materiaId']);

    if (!(await esEstudiante(id))) {
      return NextResponse.json({ error: 'El usuario no es estudiante', code: 'INVALID' }, { status: 400 });
    }

    const items = await inscribirEnMateria(id, body.materiaId);
    return NextResponse.json({
      ok: true,
      materiaId: body.materiaId,
      itemsAsignados: items,
      message: `Inscrito y ${items} ítem${items !== 1 ? 's' : ''} asignado${items !== 1 ? 's' : ''} para repaso`,
    });
  } catch (err) {
    return handleError(err);
  }
}

// ── DELETE: quitar al estudiante de una materia (?materiaId=...) ──
async function quitar(request, context) {
  try {
    const { id } = context.params;
    const materiaId = new URL(request.url).searchParams.get('materiaId');
    if (!materiaId) {
      return NextResponse.json({ error: 'materiaId requerido', code: 'MISSING_FIELDS' }, { status: 400 });
    }
    await desinscribirDeMateria(id, materiaId);
    return NextResponse.json({ ok: true, materiaId });
  } catch (err) {
    return handleError(err);
  }
}

export const GET    = withAuth(listar,    'administrador');
export const POST   = withAuth(inscribir, 'administrador');
export const DELETE = withAuth(quitar,    'administrador');
