import { supabase } from './supabase';

export function classifyWorkload(totalItems) {
  if (totalItems <= 5)  return 'low';
  if (totalItems <= 12) return 'medium';
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
  responseTimeMs, newFsrs, sstScore,
  bloomLevel, feedbackType, rating,
  feedbackParts,
  totalItemsInSession,
  onTime,
}) {
  // Acierto = el juez lo consideró correcto (rating ≥ 3 ⇔ gradeScore ≥ 0.71).
  const acierto = rating >= 3 ? 1 : 0;

  // ── Variables de investigación de la tesis ──────────────────
  const CE = classifyWorkload(totalItemsInSession);                    // Carga de estudio
  const PA = acierto;                                                  // Precisión en primer intento
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

      sst:       sstScore,
      ire_dias:  newFsrs.ire_days ?? newFsrs.IRE_days,
      d_post:    newFsrs.difficulty ?? newFsrs.D,
      s_post:    newFsrs.stability ?? newFsrs.S,
      ce:        CE,
      dd:        bloomLevel,
      cr:        feedbackType,
      tr:        TR,
      pa:        PA,
      ar:        AR,
      rating_frs: rating,
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
