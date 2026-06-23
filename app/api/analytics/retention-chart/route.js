import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler(request) {
  try {
    const params    = new URL(request.url).searchParams;
    const subjectId = params.get('subjectId');
    const period    = params.get('period') ?? params.get('periodo') ?? '30d';
    const days      = period === '7d' ? 7 : period === '30d' ? 30 : 60;
    const dateFrom  = new Date(Date.now() - days * 86400000).toISOString();

    const { data, error } = await supabase.rpc('get_retention_chart', {
      p_id_materia:  subjectId ?? null,
      p_fecha_desde: dateFrom,
    });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
