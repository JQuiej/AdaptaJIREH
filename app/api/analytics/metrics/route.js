import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const params    = new URL(request.url).searchParams;
    const subjectId = params.get('subjectId');
    const studentId = params.get('studentId');
    const period    = params.get('period') ?? params.get('periodo') ?? '30d';
    const days      = period === '7d' ? 7 : period === '30d' ? 30 : 60;
    const dateFrom  = new Date(Date.now() - days * 86400000).toISOString();

    // Supabase limita las filas por petición (tope interno de 1000), así que se
    // pagina con .range() para traer TODAS las respuestas del periodo. De lo
    // contrario los KPIs (estudiantes activos, SST, PA, AR) se calcularían solo
    // sobre las respuestas más recientes y dejarían fuera a parte de los
    // estudiantes. Se acota con MAX_PAGES para no cargar sin límite.
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 20;
    const rows = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      let query = supabase
        .from('respuesta')
        .select(`
          id_respuesta, timestamp_resp, tiempo_respuesta_ms,
          SST:sst, IRE_dias:ire_dias, D_post:d_post, S_post:s_post,
          TR:tr, PA:pa, AR:ar, CE:ce, DD:dd, CR:cr, rating_frs,
          estudiante:usuario!id_estudiante(id_usuario, nombre_usuario, grado),
          item:item!id_item(
            nivel_bloom,
            unidad:unidad_curricular!id_unidad(
              nombre,
              materia:materia!id_materia(id_materia, nombre)
            )
          )
        `)
        .gte('timestamp_resp', dateFrom)
        .order('timestamp_resp', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (studentId) query = query.eq('id_estudiante', studentId);

      const { data, error } = await query;
      if (error) throw error;

      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    const filtered = subjectId
      ? rows.filter((r) => r.item?.unidad?.materia?.id_materia === subjectId)
      : rows;

    return NextResponse.json(filtered);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
