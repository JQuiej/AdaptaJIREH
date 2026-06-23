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

    const { data, error } = await supabase.rpc('export_research_csv', {
      p_id_materia:  subjectId ?? null,
      p_fecha_desde: dateFrom,
    });

    if (error) throw error;
    if (!data?.length) {
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
