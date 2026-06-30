import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { computeReferenceEmbedding } from '@/lib/nlp';
import { translateQuestions } from '@/lib/llm';
import { esMateriaIngles } from '@/lib/idioma';

// Guarda en BD los ítems que el docente aprobó en la previsualización,
// calcula sus embeddings y los asigna (item_fsrs) a los estudiantes inscritos.
async function handler(request) {
  try {
    const body = await request.json();
    requireFields(body, ['unitId', 'bloomLevel', 'items']);
    const { unitId, bloomLevel, items, theory } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No hay ítems para guardar', code: 'EMPTY_ITEMS' },
        { status: 400 }
      );
    }

    const { data: unidad, error: unitErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, materia:materia!id_materia(id_materia, nombre)')
      .eq('id_unidad', unitId)
      .single();

    if (unitErr || !unidad) {
      return NextResponse.json(
        { error: 'Tema no encontrado', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // La traducción al español es exclusiva de la materia de inglés. En otras
    // materias (matemáticas, etc.) no se traduce y no se ofrece el botón.
    // null = sin traducción → el alumno no ve la opción.
    let traducciones = items.map(() => null);
    if (esMateriaIngles(unidad.materia?.nombre)) {
      try {
        traducciones = await translateQuestions(items.map((it) => it.question));
      } catch { traducciones = items.map(() => null); }
    }

    // Calcular embeddings de cada respuesta de referencia (en paralelo)
    const itemsToInsert = await Promise.all(
      items.map(async (it, i) => {
        let embedding_ref = null;
        try {
          embedding_ref = await computeReferenceEmbedding(it.reference_answer);
        } catch { /* embedding opcional */ }
        return {
          id_unidad:     unitId,
          nivel_bloom:   parseInt(bloomLevel, 10),
          pregunta:      it.question,
          pregunta_es:   traducciones[i] ?? null,
          respuesta_ref: it.reference_answer,
          pista:         it.feedback_hint,
          embedding_ref,
        };
      })
    );

    const { data: savedItems, error: insertErr } = await supabase
      .from('item')
      .insert(itemsToInsert)
      .select('id_item, pregunta, respuesta_ref, pista');

    if (insertErr) throw insertErr;

    // Guardar apuntes de teoría de la unidad (si Gemini los generó)
    if (theory && (theory.resumen || (theory.secciones?.length))) {
      await supabase.from('teoria').insert({
        id_unidad: unitId,
        resumen:   theory.resumen ?? '',
        secciones: theory.secciones ?? [],
      });
    }

    // Asignar a estudiantes inscritos en la materia
    const { data: inscritos } = await supabase
      .from('inscripcion')
      .select('id_estudiante')
      .eq('id_materia', unidad.materia?.id_materia);

    const students = inscritos ?? [];

    if (students.length && savedItems?.length) {
      await supabase.from('item_fsrs').upsert(
        savedItems.flatMap((it) =>
          students.map((s) => ({ id_item: it.id_item, id_estudiante: s.id_estudiante }))
        ),
        { onConflict: 'id_item,id_estudiante', ignoreDuplicates: true }
      );
    }

    return NextResponse.json(
      {
        message: `${savedItems?.length ?? 0} ítems guardados y asignados a ${students.length} estudiante${students.length !== 1 ? 's' : ''} inscritos`,
        items: savedItems,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'docente');
