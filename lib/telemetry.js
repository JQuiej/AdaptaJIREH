import { supabase } from './supabase';
import { unitELC } from './fsrs5';

export function classifyWorkload(totalItems) {
  if (totalItems <= 5)  return 'low';
  if (totalItems <= 12) return 'medium';
  return 'high';
}

async function getUnitELC(studentId, unitId) {
  const { data } = await supabase
    .from('item_fsrs')
    .select('R:r, item:item!id_item(id_unidad, activo)')
    .eq('id_estudiante', studentId)
    .eq('item.id_unidad', unitId)
    .eq('item.activo', true);

  const vals = (data ?? []).map((r) => r.R ?? 1);
  return unitELC(vals);
}

export async function logSessionEntry({
  sessionId, itemId, studentId, respuestaTexto,
  responseTimeMs, previousR, newFsrs, sstScore,
  unitId, bloomLevel, feedbackType, rating,
  feedbackParts,
  totalItemsInSession,
}) {
  // Tasa de olvido = proporción olvidada desde el último repaso (0 = no olvidó nada)
  const TO  = Math.round(Math.max(0, Math.min(1, 1 - (previousR ?? 1))) * 1000) / 1000;
  const ELC = await getUnitELC(studentId, unitId);
  const CE  = classifyWorkload(totalItemsInSession);

  const { data: logRow, error } = await supabase
    .from('respuesta')
    .insert({
      id_sesion:           sessionId,
      id_item:             itemId,
      id_estudiante:       studentId,
      respuesta_texto:     respuestaTexto,
      tiempo_respuesta_ms: responseTimeMs,

      sst:       sstScore,
      to_rate:   TO,
      ire_dias:  newFsrs.ire_days ?? newFsrs.IRE_days,
      d_post:    newFsrs.difficulty ?? newFsrs.D,
      s_post:    newFsrs.stability ?? newFsrs.S,
      r_post:    newFsrs.retrievability ?? newFsrs.R,
      elc:       ELC,
      ce:        CE,
      dd:        bloomLevel,
      cr:        feedbackType,
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
