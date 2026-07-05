import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';

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

// Crea un tema (unidad_curricular) nuevo en una materia del docente, para que
// pueda agregar temas sin depender solo de los que ya existen en la BD.
async function crearHandler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['subjectId', 'nombre']);
    const { subjectId, nombre, bloomLevel } = body;

    const nombreLimpio = String(nombre).trim();
    if (!nombreLimpio) {
      return NextResponse.json(
        { error: 'El nombre del tema es obligatorio', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    // Verificar que la materia pertenezca al docente autenticado.
    const { data: materia, error: matErr } = await supabase
      .from('materia')
      .select('id_materia')
      .eq('id_materia', subjectId)
      .eq('id_docente', user.id)
      .single();

    if (matErr || !materia) {
      return NextResponse.json(
        { error: 'Materia no encontrada', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Evitar temas duplicados (mismo nombre) dentro de la materia.
    const { data: existente } = await supabase
      .from('unidad_curricular')
      .select('id_unidad')
      .eq('id_materia', subjectId)
      .ilike('nombre', nombreLimpio)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { error: 'Ya existe un tema con ese nombre en la materia', code: 'DUPLICATE' },
        { status: 409 }
      );
    }

    const nivel = Math.min(4, Math.max(1, parseInt(bloomLevel, 10) || 2));

    const { data: unidad, error: insErr } = await supabase
      .from('unidad_curricular')
      .insert({ id_materia: subjectId, nombre: nombreLimpio, nivel_bloom: nivel })
      .select('id_unidad, nombre, nivel_bloom')
      .single();

    if (insErr) throw insErr;

    return NextResponse.json(
      { id: unidad.id_unidad, nombre: unidad.nombre, nivel_bloom: unidad.nivel_bloom },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

// Elimina un tema (unidad_curricular) de una materia del docente. Por las FK
// ON DELETE CASCADE, esto también borra sus ítems, teoría, programaciones
// FSRS y respuestas asociadas.
async function borrarHandler(request, context, user) {
  try {
    const unitId = new URL(request.url).searchParams.get('unitId');
    if (!unitId) {
      return NextResponse.json(
        { error: 'unitId requerido', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    // Verificar que el tema pertenezca a una materia del docente autenticado.
    const { data: unidad, error: uErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, materia:materia!id_materia(id_docente)')
      .eq('id_unidad', unitId)
      .single();

    if (uErr || !unidad || unidad.materia?.id_docente !== user.id) {
      return NextResponse.json(
        { error: 'Tema no encontrado', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const { error: delErr } = await supabase
      .from('unidad_curricular')
      .delete()
      .eq('id_unidad', unitId);

    if (delErr) throw delErr;

    return NextResponse.json({ message: 'Tema eliminado', id: unitId });
  } catch (err) {
    return handleError(err);
  }
}

export const GET    = withAuth(handler, 'docente');
export const POST   = withAuth(crearHandler, 'docente');
export const DELETE = withAuth(borrarHandler, 'docente');
