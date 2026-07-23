import { supabase } from './supabase';

// Carga de Estudio (CE) por sesión, según la matriz de operacionalización:
//   baja  < 10 ítems · media 10–20 ítems · alta > 20 ítems.
// (El corte por ÍTEMS es lo único disponible al registrar cada respuesta; el
//  tiempo de la sesión se evalúa en el análisis agregado.)
export function classifyWorkload(totalItems) {
  if (totalItems < 10)  return 'low';
  if (totalItems <= 20) return 'medium';
  return 'high';
}

// Un ítem se considera "de transferencia" según su nivel de Bloom:
//   Bloom 3 (Aplicar)  → transferencia cercana
//   Bloom 4 (Analizar) → transferencia lejana
//   Bloom 1–2          → no es de transferencia (TR no aplica → NULL)
function esItemDeTransferencia(bloomLevel) {
  return bloomLevel === 3 || bloomLevel === 4;
}

export async function logSessionEntry({
  sessionId, itemId, studentId, respuestaTexto,
  responseTimeMs, newFsrs, sstScore, gradeScore = null,
  bloomLevel, feedbackType, rating,
  feedbackParts,
  totalItemsInSession,
  onTime,
  usedHint = false,
  // Medida interna de la VARIABLE DEPENDIENTE (Retención Cognitiva):
  // R(t) decaída ANTES de este repaso y días transcurridos desde el anterior.
  // null en el primer repaso (sin repaso previo no hay olvido que medir).
  retencionDecaida = null,
  diasDesdeRepaso  = null,
}) {
  // Acierto = el juez lo consideró correcto (rating ≥ 3 ⇔ gradeScore ≥ 0.71).
  const acierto = rating >= 3 ? 1 : 0;

  // ── Variables de investigación de la tesis ──────────────────
  const CE = classifyWorkload(totalItemsInSession);                    // Carga de estudio
  // PA (Precisión en primer intento) se mide "sin pista previa": si el alumno
  // reveló la pista, PA = 0 aunque acierte (no fue un intento sin ayuda).
  const PA = usedHint ? 0 : acierto;                                   // Precisión en primer intento
  const AR = onTime ? 1 : 0;                                           // Adherencia al repaso
  const TR = esItemDeTransferencia(bloomLevel) ? acierto : null;      // Índice de transferencia

  const { data: logRow, error } = await supabase
    .from('respuesta')
    .insert({
      id_sesion:           sessionId,
      id_item:             itemId,
      id_estudiante:       studentId,
      respuesta_texto:     respuestaTexto,
      tiempo_respuesta_ms: responseTimeMs,

      sst:         sstScore,
      grade_score: gradeScore,   // punteo de conocimiento del juez (lo que ve el alumno)
      ire_dias:  newFsrs.ire_days ?? newFsrs.IRE_days,
      d_post:    newFsrs.difficulty ?? newFsrs.D,
      s_post:    newFsrs.stability ?? newFsrs.S,
      ce:        CE,
      dd:        bloomLevel,
      cr:        feedbackType,
      tr:        TR,
      pa:        PA,
      ar:        AR,
      uso_pista: !!usedHint,
      rating_frs: rating,
      retencion_decaida: retencionDecaida,
      dias_desde_repaso: diasDesdeRepaso,
    })
    .select('id_respuesta')
    .single();

  if (error) {
    console.error('[telemetry] Error al insertar respuesta:', error.message);
    return;
  }

  if (feedbackParts && logRow?.id_respuesta) {
    const tipo = feedbackType === 'generative'  ? 'generativa'
               : feedbackType === 'explanatory' ? 'explicativa'
               : 'basica';

    await supabase.from('retroalimentacion').insert({
      id_respuesta: logRow.id_respuesta,
      diagnostico:  feedbackParts.diagnostico ?? '',
      explicacion:  feedbackParts.explicacion ?? '',
      ejemplo:      feedbackParts.ejemplo     ?? '',
      tipo,
    });
  }
}
