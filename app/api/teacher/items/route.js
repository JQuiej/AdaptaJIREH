import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// Devuelve los ítems creados por el docente (vía sus materias) con estadísticas
// de las respuestas de los estudiantes: % de aciertos, SST, rating, etc.
async function handler(request, context, user) {
  try {
    const subjectId = new URL(request.url).searchParams.get('subjectId') || null;

    const { data, error } = await supabase.rpc('get_teacher_items', {
      p_id_docente: user.id,
      p_id_materia: subjectId,
    });
    if (error) throw error;

    const items = (data ?? []).map((it) => ({
      id:               it.id_item,
      pregunta:         it.pregunta,
      respuesta_ref:    it.respuesta_ref,
      pista:            it.pista,
      nivel_bloom:      it.nivel_bloom,
      activo:           it.activo,
      creado_en:        it.creado_en,
      materiaId:        it.id_materia,
      materia:          it.materia,
      unidadId:         it.id_unidad,
      unidad:           it.unidad,
      totalRespuestas:  Number(it.total_respuestas) || 0,
      estudiantes:      Number(it.estudiantes) || 0,
      // precisión y demás pueden venir null si el ítem no tiene respuestas
      precision:        it.precision_prom != null ? Number(it.precision_prom) : null,
      sst:              it.sst_prom       != null ? Number(it.sst_prom)       : null,
      rating:           it.rating_prom    != null ? Number(it.rating_prom)    : null,
      tiempoMs:         it.tiempo_prom_ms != null ? Number(it.tiempo_prom_ms) : null,
      ultimaRespuesta:  it.ultima_respuesta,
    }));

    return NextResponse.json(items);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
