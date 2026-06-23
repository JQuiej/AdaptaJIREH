import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { updateFSRS, ratingFromSST, calculateRetrieval } from '@/lib/fsrs5';
import { computeSST, classifyFeedback } from '@/lib/nlp';
import { gradeAnswer } from '@/lib/llm';
import { logSessionEntry } from '@/lib/telemetry';

async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['sessionId', 'itemId']);
    const {
      sessionId, itemId,
      studentResponse = '',
      responseTimeMs  = 0,
      totalItemsInSession = 1,
    } = body;

    // ── Obtener ítem ──────────────────────────────────────────
    const { data: item, error: itemErr } = await supabase
      .from('item')
      .select(`
        id_item, pregunta, respuesta_ref, pista,
        nivel_bloom, embedding_ref,
        unidad:unidad_curricular!id_unidad(id_unidad)
      `)
      .eq('id_item', itemId)
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ error: 'Ítem no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    // ── Obtener o inicializar registro FSRS ───────────────────
    let { data: fsrs } = await supabase
      .from('item_fsrs')
      .select('id_registro, D:d, S:s, R:r, total_repasos, proxima_revision, ultima_revision')
      .eq('id_item', itemId)
      .eq('id_estudiante', user.id)
      .single();

    if (!fsrs) {
      const { data } = await supabase
        .from('item_fsrs')
        .insert({ id_item: itemId, id_estudiante: user.id })
        .select('id_registro, D:d, S:s, R:r, total_repasos, proxima_revision, ultima_revision')
        .single();
      fsrs = data;
    }

    // Retenibilidad REAL al momento de este repaso (decae con los días desde el último).
    // Así la Tasa de Olvido (TO) refleja cuánto se olvidó antes de volver a repasar.
    const diasTranscurridos = fsrs?.ultima_revision
      ? Math.max(0, (Date.now() - new Date(fsrs.ultima_revision).getTime()) / 86400000)
      : 0;
    const previousR = fsrs?.ultima_revision
      ? calculateRetrieval(fsrs?.S ?? 1, diasTranscurridos)
      : 1;

    // ── Evaluar respuesta ─────────────────────────────────────
    // SST (embeddings) = variable de investigación; juez LLM = corrección real
    // que impulsa el rating y el feedback (detecta definiciones invertidas, etc.)
    let sstScore      = 0.5; // similitud semántica por embeddings
    let gradeScore    = 0.5; // corrección juzgada por el LLM
    let feedbackType  = 'basic';
    let feedbackParts = null;

    if (studentResponse) {
      // 1) SST por embeddings (se registra como variable)
      if (item.embedding_ref) {
        try {
          sstScore = await computeSST(studentResponse, item.embedding_ref);
        } catch (e) {
          console.warn('[evaluate] SST falló, SST=0.5:', e.message);
        }
      }

      // 2) Juez LLM: corrección de contenido + retroalimentación
      try {
        const g = await gradeAnswer({
          question:        item.pregunta,
          referenceAnswer: item.respuesta_ref,
          studentResponse,
          bloomLevel:      item.nivel_bloom,
        });
        gradeScore   = g.score;
        feedbackType = classifyFeedback(gradeScore);
        if (gradeScore < 0.71) feedbackParts = g; // mostrar feedback si no es correcta
      } catch (e) {
        console.warn('[evaluate] juez LLM falló, uso SST:', e.message);
        gradeScore   = sstScore;
        feedbackType = classifyFeedback(sstScore);
      }
    }

    // ── Actualizar FSRS (rating según la corrección del LLM) ───
    const rating  = ratingFromSST(gradeScore);
    const newFsrs = updateFSRS(
      fsrs?.D ?? 0.3,
      fsrs?.S ?? 1.0,
      previousR,
      rating,
      fsrs?.total_repasos ?? 0
    );

    await supabase
      .from('item_fsrs')
      .update({
        d:               newFsrs.difficulty,
        s:               newFsrs.stability,
        r:               newFsrs.retrievability,
        proxima_revision: newFsrs.next_review,
        ultima_revision:  new Date().toISOString(),
        total_repasos:    (fsrs?.total_repasos ?? 0) + 1,
      })
      .eq('id_item', itemId)
      .eq('id_estudiante', user.id);

    // ── Telemetría (se registra toda revisión, incluida la primera) ──
    await logSessionEntry({
      sessionId,
      itemId,
      studentId:          user.id,
      respuestaTexto:     studentResponse,
      responseTimeMs,
      previousR,
      newFsrs,
      sstScore,
      unitId:             item.unidad?.id_unidad,
      bloomLevel:         item.nivel_bloom,
      feedbackType,
      rating,
      feedbackParts,
      totalItemsInSession,
    });

    // ── Incrementar ítems completados en la sesión ────────────
    try {
      await supabase.rpc('incrementar_items_completados', { p_id_sesion: sessionId });
    } catch { /* no crítico */ }

    return NextResponse.json({
      sst_score:        sstScore,    // similitud por embeddings
      grade_score:      gradeScore,  // corrección juzgada por el LLM (lo que se muestra)
      feedback_type:    feedbackType,
      feedback:         feedbackParts?.texto ?? (gradeScore < 0.71 ? item.pista : null),
      feedback_parts:   feedbackParts
        ? {
            diagnostico: feedbackParts.diagnostico,
            explicacion: feedbackParts.explicacion,
            ejemplo:     feedbackParts.ejemplo,
          }
        : null,
      reference_answer: item.respuesta_ref,
      fsrs:             newFsrs,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'estudiante');
