import { supabase } from './supabase';
import { unitELC, calculateRetrieval } from './fsrs5';

export function classifyWorkload(totalItems) {
  if (totalItems <= 5)  return 'low';
  if (totalItems <= 12) return 'medium';
  return 'high';
}

// ELC (Estado Latente de Conocimiento) = retención promedio de la unidad.
// Usa la retención DECAÍDA real de cada ítem (con S y días desde el último
// repaso), no la R guardada (que es ≈1 justo tras repasar y no tiene varianza).
async function getUnitELC(studentId, unitId) {
  const { data } = await supabase
    .from('item_fsrs')
    .select('S:s, ultima_revision, item:item!id_item(id_unidad, activo)')
    .eq('id_estudiante', studentId)
    .eq('item.id_unidad', unitId)
    .eq('item.activo', true);

  const vals = (data ?? [])
    .filter((r) => r.item?.activo && r.item?.id_unidad === unitId)
    .map((r) => {
      if (!r.ultima_revision) return 1; // recién asignado: retención plena
      const dias = Math.max(0, (Date.now() - new Date(r.ultima_revision).getTime()) / 86400000);
      return calculateRetrieval(r.S ?? 1, dias);
    });
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
      // R = retención decaída al momento del repaso (qué tanto recordabas antes
      // de responder). Tiene varianza y cumple R + TO ≈ 1. Antes se guardaba la
      // R post-actualización (≈1 siempre), que no servía para el análisis.
      r_post:    Math.round((previousR ?? 1) * 1000) / 1000,
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
