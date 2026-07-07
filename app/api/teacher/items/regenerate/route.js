import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { regenerateItem } from '@/lib/llm';
import { computeReferenceEmbedding } from '@/lib/nlp';
import { esMateriaIngles } from '@/lib/idioma';

// Regenera UN ítem individual del docente manteniendo su nivel Bloom pero
// cambiando la pregunta, la respuesta de referencia y la pista. Se le pasa a la
// IA el material de estudio del tema (teoría) como contexto y el ajuste de
// dificultad que pidió el docente ('facil' | 'dificil' | 'similar') más una
// indicación libre opcional. Actualiza el ítem en su lugar (conserva id_item y
// las programaciones FSRS de los alumnos).
const AJUSTES = new Set(['facil', 'dificil', 'similar']);

async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['itemId']);
    const { itemId } = body;
    const ajuste      = AJUSTES.has(body.ajuste) ? body.ajuste : 'similar';
    const instruccion = typeof body.instruccion === 'string' ? body.instruccion.slice(0, 500) : '';

    // Cargar el ítem con su tema y materia, verificando que pertenezca al docente.
    const { data: item, error: itErr } = await supabase
      .from('item')
      .select(
        'id_item, pregunta, respuesta_ref, pista, nivel_bloom, id_unidad, ' +
        'unidad:unidad_curricular!id_unidad(id_unidad, nombre, materia:materia!id_materia(id_materia, nombre, id_docente))'
      )
      .eq('id_item', itemId)
      .single();

    if (itErr || !item || item.unidad?.materia?.id_docente !== user.id) {
      return NextResponse.json({ error: 'Ítem no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    const subjectName = item.unidad?.materia?.nombre ?? 'Materia';
    const unitName    = item.unidad?.nombre ?? 'Tema';

    // Material de estudio del tema: la teoría (resumen + secciones) generada al
    // subir el PDF. Es el contexto que se le da a la IA para regenerar.
    const { data: teoria } = await supabase
      .from('teoria')
      .select('resumen, secciones')
      .eq('id_unidad', item.id_unidad)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    let materialContext = '';
    if (teoria) {
      const secciones = Array.isArray(teoria.secciones) ? teoria.secciones : [];
      materialContext = [
        teoria.resumen ?? '',
        ...secciones.map((s) => `${s.titulo ?? ''}: ${s.contenido ?? ''}`),
      ].filter(Boolean).join('\n');
    }

    // Otras preguntas del tema, para no repetir ni parafrasear.
    const { data: otras } = await supabase
      .from('item')
      .select('pregunta')
      .eq('id_unidad', item.id_unidad)
      .neq('id_item', itemId);
    const excludeQuestions = (otras ?? []).map((o) => o.pregunta).filter(Boolean);

    const nuevo = await regenerateItem({
      subjectName,
      unitName,
      bloomLevel:      item.nivel_bloom,
      materialContext,
      currentQuestion: item.pregunta,
      ajuste,
      instruccion,
      esIngles:        esMateriaIngles(subjectName),
      excludeQuestions,
    });

    if (!nuevo.question?.trim() || !nuevo.reference_answer?.trim()) {
      return NextResponse.json(
        { error: 'La IA no devolvió una pregunta válida. Intenta de nuevo.', code: 'LLM_EMPTY' },
        { status: 502 }
      );
    }

    // Recalcular el embedding de la nueva respuesta de referencia (opcional).
    let embedding_ref = null;
    try {
      embedding_ref = await computeReferenceEmbedding(nuevo.reference_answer);
    } catch { /* embedding opcional */ }

    // Actualizar en su lugar. Se limpian pregunta_es/pista_es: en inglés el nuevo
    // ítem ya viene en español, y en las demás materias no aplican.
    const { data: actualizado, error: updErr } = await supabase
      .from('item')
      .update({
        pregunta:      nuevo.question.trim(),
        respuesta_ref: nuevo.reference_answer.trim(),
        pista:         nuevo.feedback_hint?.trim() ?? '',
        pregunta_es:   null,
        pista_es:      null,
        embedding_ref,
      })
      .eq('id_item', itemId)
      .select('id_item, pregunta, respuesta_ref, pista, nivel_bloom')
      .single();

    if (updErr) throw updErr;

    return NextResponse.json({
      message: 'Ítem regenerado',
      item: {
        id:            actualizado.id_item,
        pregunta:      actualizado.pregunta,
        respuesta_ref: actualizado.respuesta_ref,
        pista:         actualizado.pista,
        nivel_bloom:   actualizado.nivel_bloom,
      },
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
