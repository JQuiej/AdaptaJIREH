import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// Pronóstico de repasos: cuántos ítems vencen cada día en los próximos N días.
// Los vencidos (fecha pasada) se suman al día de hoy.
async function handler(request, context, user) {
  try {
    const DIAS = 7;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('item_fsrs')
      .select('proxima_revision, item:item!id_item(activo, unidad:unidad_curricular!id_unidad(visible))')
      .eq('id_estudiante', user.id);

    if (error) throw error;

    // Solo ítems activos y de temas visibles.
    const filas = (data ?? []).filter((r) => r.item?.activo && r.item?.unidad?.visible);

    // Inicializar los próximos N días con contador 0
    const dias = [];
    for (let i = 0; i < DIAS; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + i);
      dias.push({ fecha: d.toISOString().split('T')[0], count: 0 });
    }
    const indicePorFecha = new Map(dias.map((d, i) => [d.fecha, i]));
    const hoyStr = dias[0].fecha;
    const limiteStr = dias[DIAS - 1].fecha;

    for (const f of filas) {
      const fecha = f.proxima_revision;
      if (!fecha) continue;
      if (fecha <= hoyStr) {
        dias[0].count += 1;            // vencidos + de hoy → hoy
      } else if (fecha <= limiteStr) {
        dias[indicePorFecha.get(fecha)].count += 1;
      }
      // más allá del rango no se cuenta
    }

    return NextResponse.json(dias);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
