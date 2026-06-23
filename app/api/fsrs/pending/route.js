import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('item_fsrs')
      .select(`
        id_registro, D:d, S:s, R:r, proxima_revision, total_repasos, ultima_revision,
        item:item!id_item(
          id_item, pregunta, respuesta_ref, pista, nivel_bloom, activo,
          unidad:unidad_curricular!id_unidad(
            id_unidad, nombre, nivel_bloom,
            materia:materia!id_materia(id_materia, nombre)
          )
        )
      `)
      .eq('id_estudiante', user.id)
      .lte('proxima_revision', today)
      .order('proxima_revision', { ascending: true });

    if (error) throw error;

    let pending = (data ?? []).filter((r) => r.item?.activo);
    if (subjectId) {
      pending = pending.filter(
        (r) => r.item?.unidad?.materia?.id_materia === subjectId
      );
    }

    // ── Carga cognitiva (Teoría de Sweller) ──────────────────────
    // 1) Priorizar: ordenar por menor retenibilidad R (lo más a punto de
    //    olvidarse va primero), y como desempate, lo más vencido.
    // 2) Limitar el tamaño de la sesión para no exceder la carga cognitiva.
    //    El umbral coincide con classifyWorkload: ≤12 = carga "media".
    const MAX_ITEMS_SESION = 12;
    pending.sort((a, b) => {
      const dr = (a.R ?? 1) - (b.R ?? 1);
      if (dr !== 0) return dr;
      return (a.proxima_revision ?? '').localeCompare(b.proxima_revision ?? '');
    });
    pending = pending.slice(0, MAX_ITEMS_SESION);

    // Normalizar: 'id' en el nivel item_fsrs y en el nivel item para compatibilidad frontend
    const result = pending.map(({ item, id_registro, ...rest }) => ({
      id: id_registro,
      ...rest,
      item: item
        ? {
            id:           item.id_item,
            pregunta:     item.pregunta,
            respuesta_ref: item.respuesta_ref,
            pista:        item.pista,
            nivel_bloom:  item.nivel_bloom,
            activo:       item.activo,
            unidad:       item.unidad
              ? {
                  id:          item.unidad.id_unidad,
                  nombre:      item.unidad.nombre,
                  nivel_bloom: item.unidad.nivel_bloom,
                  materia:     item.unidad.materia
                    ? { id: item.unidad.materia.id_materia, nombre: item.unidad.materia.nombre }
                    : null,
                }
              : null,
          }
        : null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
