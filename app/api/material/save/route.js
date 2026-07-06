import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { computeReferenceEmbedding } from '@/lib/nlp';
import { translateQuestions } from '@/lib/llm';
import { pareceIngles } from '@/lib/idioma';

// Guarda en BD los ítems que el docente aprobó en la previsualización,
// calcula sus embeddings y los asigna (item_fsrs) a los estudiantes inscritos.
async function handler(request) {
  try {
    const body = await request.json();
    requireFields(body, ['unitId', 'items']);
    const { unitId, bloomLevel, items, theory } = body;

    // Nivel Bloom por ítem: cada uno trae su `bloom` (1-4). Si faltara, se usa
    // el bloomLevel general recibido o 1 como respaldo.
    const nivelDe = (it) => {
      const n = parseInt(it?.bloom ?? bloomLevel ?? 1, 10);
      return Math.min(4, Math.max(1, Number.isFinite(n) ? n : 1));
    };

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

    // Traducir al español SOLO los textos que están en inglés (preguntas y
    // pistas). Los que ya están en español quedan en null.
    const traducciones      = items.map(() => null); // traducción de la pregunta
    const traduccionesPista  = items.map(() => null); // traducción de la pista

    const idxIngles = items
      .map((it, i) => (pareceIngles(it.question) ? i : -1))
      .filter((i) => i >= 0);
    if (idxIngles.length) {
      try {
        const trads = await translateQuestions(idxIngles.map((i) => items[i].question));
        idxIngles.forEach((origIdx, k) => { traducciones[origIdx] = trads[k] ?? null; });
      } catch { /* si falla, los ítems quedan sin traducción */ }
    }

    const idxPistaIngles = items
      .map((it, i) => (it.feedback_hint && pareceIngles(it.feedback_hint) ? i : -1))
      .filter((i) => i >= 0);
    if (idxPistaIngles.length) {
      try {
        const trads = await translateQuestions(idxPistaIngles.map((i) => items[i].feedback_hint));
        idxPistaIngles.forEach((origIdx, k) => { traduccionesPista[origIdx] = trads[k] ?? null; });
      } catch { /* si falla, la pista queda sin traducción */ }
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
          nivel_bloom:   nivelDe(it),
          pregunta:      it.question,
          pregunta_es:   traducciones[i] ?? null,      // solo si la pregunta está en inglés
          respuesta_ref: it.reference_answer,
          pista:         it.feedback_hint,
          pista_es:      traduccionesPista[i] ?? null,  // solo si la pista está en inglés
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
