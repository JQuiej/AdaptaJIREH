import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { itemsAcertados, filtrarPorBloom, componerSesion, cargaCognitivaRecomendada } from '@/lib/progression';

async function handler(request, context, user) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const today = new Date().toISOString().split('T')[0];

    // Traer TODOS los ítems del estudiante (no solo los vencidos): se necesita
    // el conjunto completo para calcular el dominio por nivel de cada unidad.
    const { data, error } = await supabase
      .from('item_fsrs')
      .select(`
        id_registro, D:d, S:s, R:r, proxima_revision, total_repasos, ultima_revision,
        item:item!id_item(
          id_item, pregunta, pregunta_es, respuesta_ref, pista, pista_es, nivel_bloom, activo,
          unidad:unidad_curricular!id_unidad(
            id_unidad, nombre, nivel_bloom, visible,
            materia:materia!id_materia(id_materia, nombre)
          )
        )
      `)
      .eq('id_estudiante', user.id)
      .order('proxima_revision', { ascending: true });

    if (error) throw error;

    // Solo ítems activos y de temas visibles (los ocultos no entran a la sesión).
    let filas = (data ?? []).filter((r) => r.item?.activo && r.item?.unidad?.visible);
    if (subjectId) {
      filas = filas.filter(
        (r) => r.item?.unidad?.materia?.id_materia === subjectId
      );
    }

    if (filas.length === 0) return NextResponse.json([]);

    // ── Compuerta de Bloom + composición de la sesión ────────
    const acertados  = await itemsAcertados(user.id, filas.map((r) => r.item.id_item));
    const permitidos = filtrarPorBloom(filas, acertados);
    const sesion     = componerSesion(permitidos, today);

    // Carga cognitiva recomendada por alumno (no recorta la sesión; solo orienta).
    const recommended = Math.min(cargaCognitivaRecomendada(filas), sesion.length);

    // Normalizar: 'id' en el nivel item_fsrs y en el nivel item para compatibilidad frontend
    const items = sesion.map(({ item, id_registro, ...rest }) => ({
      id: id_registro,
      ...rest,
      item: item
        ? {
            id:           item.id_item,
            pregunta:     item.pregunta,
            pregunta_es:  item.pregunta_es,
            respuesta_ref: item.respuesta_ref,
            pista:        item.pista,
            pista_es:     item.pista_es,
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

    return NextResponse.json({ items, recommended });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
