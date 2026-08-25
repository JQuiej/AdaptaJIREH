import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { calculateRetrieval } from '@/lib/fsrs5';
import { historialItems, filtrarPorBloom, componerSesion, cargaCognitivaRecomendada } from '@/lib/progression';

// R(t) actual de un ítem: decae con los días transcurridos desde el último repaso.
function retencionActual(fila) {
  if (!fila.ultima_revision) return 1; // nunca repasado → recién asignado
  const dias = (Date.now() - new Date(fila.ultima_revision).getTime()) / 86400000;
  return calculateRetrieval(fila.S ?? 1, Math.max(0, dias));
}

async function handler(request, context, user) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Materias donde el estudiante está inscrito
    const { data: inscripciones, error } = await supabase
      .from('inscripcion')
      .select('materia:materia!id_materia(id_materia, nombre, activa)')
      .eq('id_estudiante', user.id);

    if (error) throw error;

    const materias = (inscripciones ?? [])
      .map((i) => i.materia)
      .filter((m) => m?.activa);

    // Para cada materia: contar pendientes y calcular R promedio
    const resultado = await Promise.all(
      materias.map(async (m) => {
        const { data: fsrsRows } = await supabase
          .from('item_fsrs')
          .select(`
            proxima_revision, D:d, S:s, R:r, ultima_revision,
            item:item!id_item(
              id_item, nivel_bloom, activo,
              unidad:unidad_curricular!id_unidad(id_unidad, id_materia, visible)
            )
          `)
          .eq('id_estudiante', user.id)
          .eq('item.unidad.id_materia', m.id_materia);

        const filas   = (fsrsRows ?? []).filter(
          (r) => r.item?.activo && r.item?.unidad?.visible && r.item?.unidad?.id_materia === m.id_materia
        );

        // El conteo del panel refleja la sesión real (misma compuerta de Bloom).
        // Los repasos vencidos NO se topan; el número recomendado (carga cognitiva
        // por alumno) solo orienta cuántos repasar.
        const { intentados, acertados } = await historialItems(user.id, filas.map((r) => r.item.id_item));
        const permitidos = filtrarPorBloom(filas, acertados, intentados);
        const sesion     = componerSesion(permitidos, today);
        const pending    = sesion.length;
        const recommended = Math.min(cargaCognitivaRecomendada(filas), pending);
        const avgR    = filas.length
          ? Math.round(filas.reduce((s, r) => s + retencionActual(r), 0) / filas.length * 100)
          : 100;

        return {
          id:            m.id_materia,
          nombre:        m.nombre,
          pending_count: pending,
          recommended,
          avg_retention: avgR,
        };
      })
    );

    return NextResponse.json(resultado);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
