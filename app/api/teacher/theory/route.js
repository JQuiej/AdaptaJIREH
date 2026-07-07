import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { generateMoreTheorySections } from '@/lib/llm';
import { esMateriaIngles } from '@/lib/idioma';

// Módulo de material de estudio (teoría) del docente: le permite ver y editar
// los apuntes de cada tema, agregar/quitar secciones o crear material donde
// falte. Una fila de teoría por tema (se normaliza al guardar).

// Verifica que la materia pertenezca al docente autenticado.
async function materiaDelDocente(subjectId, userId) {
  const { data } = await supabase
    .from('materia')
    .select('id_materia')
    .eq('id_materia', subjectId)
    .eq('id_docente', userId)
    .maybeSingle();
  return !!data;
}

// GET ?subjectId= → temas de la materia con su teoría (para administrarla).
async function handler(request, context, user) {
  try {
    const subjectId = new URL(request.url).searchParams.get('subjectId');
    if (!subjectId) {
      return NextResponse.json({ error: 'subjectId requerido', code: 'MISSING_FIELDS' }, { status: 400 });
    }
    if (!(await materiaDelDocente(subjectId, user.id))) {
      return NextResponse.json({ error: 'Materia no encontrada', code: 'NOT_FOUND' }, { status: 404 });
    }

    const { data: unidades, error: uErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, nivel_bloom')
      .eq('id_materia', subjectId)
      .order('nombre');
    if (uErr) throw uErr;

    const unitIds = (unidades ?? []).map((u) => u.id_unidad);

    // Teoría de esos temas. Puede haber más de una fila por tema (histórico);
    // se toma la más reciente por unidad.
    const teoriaPorUnidad = {};
    if (unitIds.length) {
      const { data: teorias } = await supabase
        .from('teoria')
        .select('id_teoria, id_unidad, resumen, secciones, creado_en')
        .in('id_unidad', unitIds)
        .order('creado_en', { ascending: false });
      for (const t of teorias ?? []) {
        if (!teoriaPorUnidad[t.id_unidad]) teoriaPorUnidad[t.id_unidad] = t;
      }
    }

    const result = (unidades ?? []).map((u) => {
      const t = teoriaPorUnidad[u.id_unidad] ?? null;
      const secciones = Array.isArray(t?.secciones) ? t.secciones : [];
      return {
        id:          u.id_unidad,
        nombre:      u.nombre,
        nivel_bloom: u.nivel_bloom,
        tieneTeoria: !!t,
        resumen:     t?.resumen ?? '',
        secciones:   secciones.map((s) => ({ titulo: s?.titulo ?? '', contenido: s?.contenido ?? '' })),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

// PUT → guarda (crea o reemplaza) la teoría de un tema editada por el docente.
// Body: { unitId, resumen, secciones: [{ titulo, contenido }] }
async function guardarHandler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['unitId']);
    const { unitId } = body;

    // Verificar que el tema pertenezca a una materia del docente.
    const { data: unidad, error: uErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, materia:materia!id_materia(id_docente)')
      .eq('id_unidad', unitId)
      .single();
    if (uErr || !unidad || unidad.materia?.id_docente !== user.id) {
      return NextResponse.json({ error: 'Tema no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    const resumen = typeof body.resumen === 'string' ? body.resumen.trim() : '';

    // Sanear secciones: strings, sin secciones totalmente vacías.
    const secciones = (Array.isArray(body.secciones) ? body.secciones : [])
      .map((s) => ({
        titulo:    typeof s?.titulo === 'string' ? s.titulo.trim() : '',
        contenido: typeof s?.contenido === 'string' ? s.contenido.trim() : '',
      }))
      .filter((s) => s.titulo || s.contenido);

    if (!resumen && secciones.length === 0) {
      return NextResponse.json(
        { error: 'Agrega un resumen o al menos una sección con contenido.', code: 'EMPTY_THEORY' },
        { status: 400 }
      );
    }

    // Normalizar a una sola fila por tema: borrar lo existente e insertar.
    await supabase.from('teoria').delete().eq('id_unidad', unitId);
    const { data: insertada, error: insErr } = await supabase
      .from('teoria')
      .insert({ id_unidad: unitId, resumen, secciones })
      .select('id_teoria, resumen, secciones')
      .single();
    if (insErr) throw insErr;

    return NextResponse.json({
      message: 'Material de estudio guardado',
      teoria: {
        tieneTeoria: true,
        resumen:     insertada.resumen ?? '',
        secciones:   Array.isArray(insertada.secciones) ? insertada.secciones : [],
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

// POST → genera con IA secciones NUEVAS del tema, distintas de las actuales.
// NO guarda: las devuelve para que el docente las revise y luego guarde con PUT.
// Body: { unitId, resumen, secciones: [{titulo, contenido}], count }
async function generarSeccionesHandler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['unitId']);
    const { unitId } = body;

    // Verificar propiedad y obtener nombres de tema y materia.
    const { data: unidad, error: uErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, materia:materia!id_materia(nombre, id_docente)')
      .eq('id_unidad', unitId)
      .single();
    if (uErr || !unidad || unidad.materia?.id_docente !== user.id) {
      return NextResponse.json({ error: 'Tema no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Las secciones actuales llegan desde el editor (incluye cambios sin guardar),
    // así se evita repetir también lo que el docente acaba de agregar.
    const resumen = typeof body.resumen === 'string' ? body.resumen : '';
    const existingSections = (Array.isArray(body.secciones) ? body.secciones : [])
      .map((s) => ({ titulo: s?.titulo ?? '', contenido: s?.contenido ?? '' }))
      .filter((s) => s.titulo || s.contenido);
    const count = Math.max(1, Math.min(6, parseInt(body.count, 10) || 2));

    const subjectName = unidad.materia?.nombre ?? 'Materia';
    const nuevas = await generateMoreTheorySections({
      subjectName,
      unitName:  unidad.nombre,
      resumen,
      existingSections,
      count,
      esIngles:  esMateriaIngles(subjectName),
    });

    if (!nuevas.length) {
      return NextResponse.json(
        { error: 'La IA no devolvió secciones. Intenta de nuevo.', code: 'LLM_EMPTY' },
        { status: 502 }
      );
    }

    return NextResponse.json({ secciones: nuevas });
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many')) {
      return NextResponse.json(
        { error: 'Cuota de Gemini agotada. Espera unos minutos.', code: 'QUOTA_EXCEEDED' },
        { status: 503 }
      );
    }
    if (err.message?.includes('Gemini') || err.message?.includes('GenerativeAI') || err.message?.includes('503')) {
      return NextResponse.json(
        { error: 'Servicio Gemini no disponible. Intenta de nuevo.', code: 'LLM_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return handleError(err);
  }
}

export const GET  = withAuth(handler, 'docente');
export const PUT  = withAuth(guardarHandler, 'docente');
export const POST = withAuth(generarSeccionesHandler, 'docente');
