import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// Devuelve todas las respuestas de un ítem (por estudiante) con la nota que el
// sistema le dio a cada una. Solo si el ítem es de una materia del docente.
async function handler(request, context, user) {
  try {
    const itemId = new URL(request.url).searchParams.get('itemId');
    if (!itemId) {
      return NextResponse.json({ error: 'Falta itemId', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('get_item_responses', {
      p_id_item:    itemId,
      p_id_docente: user.id,
    });
    if (error) throw error;

    const respuestas = (data ?? []).map((r) => ({
      id:            r.id_respuesta,
      estudianteId:  r.id_estudiante,
      codigoAnonimo: r.codigo_anonimo,
      grado:         r.grado,
      texto:         r.respuesta_texto,
      fecha:         r.timestamp_resp,
      // gradeScore = nota exacta [0,1] (null en respuestas previas a la migración
      // 022); ratingFrs sirve para reconstruir la banda cuando gradeScore es null.
      gradeScore:    r.grade_score != null ? Number(r.grade_score) : null,
      ratingFrs:     r.rating_frs  != null ? Number(r.rating_frs)  : null,
      sst:           r.sst != null ? Number(r.sst) : null,
      usoPista:      !!r.uso_pista,
      tiempoMs:      r.tiempo_respuesta_ms != null ? Number(r.tiempo_respuesta_ms) : null,
      // Retroalimentación dada a la respuesta (null/vacío si no tuvo).
      retro: r.retro_diagnostico || r.retro_explicacion || r.retro_ejemplo
        ? {
            tipo:        r.retro_tipo ?? null,
            diagnostico: r.retro_diagnostico ?? '',
            explicacion: r.retro_explicacion ?? '',
            ejemplo:     r.retro_ejemplo ?? '',
          }
        : null,
    }));

    return NextResponse.json(respuestas);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
