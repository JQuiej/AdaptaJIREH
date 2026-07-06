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
      .select('id_unidad, nombre, nivel_bloom, visible')
      .eq('id_materia', subjectId)
      .order('nombre');

    if (error) throw error;

    // Conteo de ítems por tema (para saber cuáles ya están listos para activar).
    const unitIds = (data ?? []).map((u) => u.id_unidad);
    const conteos = {};
    if (unitIds.length) {
      const { data: its } = await supabase
        .from('item')
        .select('id_unidad')
        .in('id_unidad', unitIds);
      for (const it of its ?? []) {
        conteos[it.id_unidad] = (conteos[it.id_unidad] ?? 0) + 1;
      }
    }

    // Normalizar: exponer 'id' para compatibilidad con el frontend
    const result = (data ?? []).map((u) => ({
      id:          u.id_unidad,
      nombre:      u.nombre,
      nivel_bloom: u.nivel_bloom,
      visible:     u.visible,
      items:       conteos[u.id_unidad] ?? 0,
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

    // Los temas nuevos nacen OCULTOS: el docente los activa desde «Temas»
    // cuando quiera que los alumnos los vean.
    const { data: unidad, error: insErr } = await supabase
      .from('unidad_curricular')
      .insert({ id_materia: subjectId, nombre: nombreLimpio, nivel_bloom: nivel, visible: false })
      .select('id_unidad, nombre, nivel_bloom, visible')
      .single();

    if (insErr) throw insErr;

    return NextResponse.json(
      {
        id:          unidad.id_unidad,
        nombre:      unidad.nombre,
        nivel_bloom: unidad.nivel_bloom,
        visible:     unidad.visible,
        items:       0,
      },
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

// Muestra u oculta un tema para los alumnos (visibilidad).
async function actualizarHandler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['unitId']);
    const { unitId, visible } = body;

    // Verificar que el tema pertenezca a una materia del docente autenticado.
    const { data: unidad, error: uErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, materia:materia!id_materia(id_docente)')
      .eq('id_unidad', unitId)
      .single();

    if (uErr || !unidad || unidad.materia?.id_docente !== user.id) {
      return NextResponse.json({ error: 'Tema no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    const { data: upd, error: updErr } = await supabase
      .from('unidad_curricular')
      .update({ visible: !!visible })
      .eq('id_unidad', unitId)
      .select('id_unidad, nombre, nivel_bloom, visible')
      .single();

    if (updErr) throw updErr;

    return NextResponse.json({
      id:          upd.id_unidad,
      nombre:      upd.nombre,
      nivel_bloom: upd.nivel_bloom,
      visible:     upd.visible,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const GET    = withAuth(handler, 'docente');
export const POST   = withAuth(crearHandler, 'docente');
export const PATCH  = withAuth(actualizarHandler, 'docente');
export const DELETE = withAuth(borrarHandler, 'docente');
