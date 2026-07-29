import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request) {
  try {
    const params    = new URL(request.url).searchParams;
    const subjectId = params.get('subjectId');
    const period    = params.get('period') ?? params.get('periodo') ?? '60d';
    const days      = period === '7d' ? 7 : period === '30d' ? 30 : 60;
    const dateFrom  = new Date(Date.now() - days * 86400000).toISOString();

    // PostgREST corta los resultados en 1000 filas por petición (también en RPC),
    // así que se pagina con .range() hasta traer TODAS las filas. La función
    // ordena por (codigo_anonimo, timestamp_resp), por lo que la paginación es
    // estable (no duplica ni salta filas).
    const PAGE_SIZE = 1000;
    let data = [];
    for (let page = 0; ; page++) {
      const { data: chunk, error } = await supabase
        .rpc('export_research_csv', {
          p_id_materia:  subjectId ?? null,
          p_fecha_desde: dateFrom,
        })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      if (!chunk?.length) break;
      data = data.concat(chunk);
      if (chunk.length < PAGE_SIZE) break; // última página
    }

    if (!data.length) {
      return NextResponse.json({ error: 'Sin datos para exportar', code: 'NO_DATA' }, { status: 404 });
    }

    const headers = Object.keys(data[0]).join(',');
    const rows    = data.map((r) =>
      Object.values(r).map((v) => (v == null ? '' : String(v).replace(/,/g, ';'))).join(',')
    );
    const csv = [headers, ...rows].join('\r\n');

    return new NextResponse('﻿' + csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="adaptajireh_${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
