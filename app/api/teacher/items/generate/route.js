import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { generateItemsByLevel } from '@/lib/llm';
import { computeReferenceEmbedding } from '@/lib/nlp';
import { esMateriaIngles } from '@/lib/idioma';

// Crea ítems NUEVOS para un tema desde «Mis ítems», útil cuando quedan pocos y
// los alumnos ya avanzaron. Usa el material de estudio del tema (teoría) como
// contexto y excluye las preguntas existentes para no repetir. Genera `perLevel`
// ítems por cada uno de los 4 niveles Bloom, los guarda y los asigna a los
// estudiantes inscritos en la materia.
async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['unitId']);
    const { unitId } = body;
    const perLevel = Math.max(1, Math.min(5, parseInt(body.perLevel, 10) || 2));

    // Verificar propiedad y obtener nombres de tema y materia.
    const { data: unidad, error: uErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, materia:materia!id_materia(id_materia, nombre, id_docente)')
      .eq('id_unidad', unitId)
      .single();
    if (uErr || !unidad || unidad.materia?.id_docente !== user.id) {
      return NextResponse.json({ error: 'Tema no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    const subjectName = unidad.materia?.nombre ?? 'Materia';
    const unitName    = unidad.nombre;

    // Material de estudio del tema (teoría) como contexto para la generación.
    const { data: teoria } = await supabase
      .from('teoria')
      .select('resumen, secciones')
      .eq('id_unidad', unitId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    let material = '';
    if (teoria) {
      const secciones = Array.isArray(teoria.secciones) ? teoria.secciones : [];
      material = [
        teoria.resumen ?? '',
        ...secciones.map((s) => `${s.titulo ?? ''}: ${s.contenido ?? ''}`),
      ].filter(Boolean).join('\n');
    }

    // Preguntas existentes del tema → exclusiones para no repetir.
    const { data: existentes } = await supabase
      .from('item')
      .select('pregunta')
      .eq('id_unidad', unitId);
    const excludeQuestions = (existentes ?? []).map((o) => o.pregunta).filter(Boolean);

    const generados = await generateItemsByLevel({
      extractedText: material,
      subjectName,
      unitName,
      perLevel,
      excludeQuestions,
      esIngles: esMateriaIngles(subjectName),
    });

    if (!generados.length) {
      return NextResponse.json(
        { error: 'La IA no devolvió ítems. Intenta de nuevo.', code: 'LLM_EMPTY' },
        { status: 502 }
      );
    }

    const nivelDe = (it) => {
      const n = parseInt(it?.bloom, 10);
      return Math.min(4, Math.max(1, Number.isFinite(n) ? n : 1));
    };

    // Calcular embeddings (en paralelo) y armar filas a insertar. En inglés los
    // ítems ya se generan en español, así que no se traducen (pregunta_es null).
    const itemsToInsert = await Promise.all(
      generados.map(async (it) => {
        let embedding_ref = null;
        try {
          embedding_ref = await computeReferenceEmbedding(it.reference_answer);
        } catch { /* embedding opcional */ }
        return {
          id_unidad:     unitId,
          nivel_bloom:   nivelDe(it),
          pregunta:      it.question,
          respuesta_ref: it.reference_answer,
          pista:         it.feedback_hint,
          embedding_ref,
        };
      })
    );

    const { data: saved, error: insErr } = await supabase
      .from('item')
      .insert(itemsToInsert)
      .select('id_item');
    if (insErr) throw insErr;

    // Asignar los ítems nuevos a los estudiantes inscritos en la materia.
    const { data: inscritos } = await supabase
      .from('inscripcion')
      .select('id_estudiante')
      .eq('id_materia', unidad.materia?.id_materia);
    const students = inscritos ?? [];

    if (students.length && saved?.length) {
      await supabase.from('item_fsrs').upsert(
        saved.flatMap((it) =>
          students.map((s) => ({ id_item: it.id_item, id_estudiante: s.id_estudiante }))
        ),
        { onConflict: 'id_item,id_estudiante', ignoreDuplicates: true }
      );
    }

    return NextResponse.json({
      message: `${saved?.length ?? 0} ítems nuevos creados en «${unitName}»`,
      count:   saved?.length ?? 0,
    });
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

export const POST = withAuth(handler, 'docente');
