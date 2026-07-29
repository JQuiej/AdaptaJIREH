import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// Porcentaje de uso de la app por estudiante (misma lógica que
// supabase/scripts/porcentaje_uso.sql): días activos / días desde la primera
// respuesta hasta hoy. Acotado a los estudiantes de las materias del docente.
async function handler(request, context, user) {
  try {
    const { data, error } = await supabase.rpc('get_student_usage', {
      p_id_docente: user.id,
    });
    if (error) throw error;

    const filas = (data ?? []).map((r) => ({
      estudianteId:     r.id_estudiante,
      codigoAnonimo:    r.codigo_anonimo,
      grado:            r.grado,
      primeraFecha:     r.primera_fecha,
      ultimaFecha:      r.ultima_fecha,
      diasTranscurridos: r.dias_transcurridos != null ? Number(r.dias_transcurridos) : null,
      diasActivos:      Number(r.dias_activos) || 0,
      diasInactivos:    r.dias_inactivos != null ? Number(r.dias_inactivos) : null,
      totalRespuestas:  Number(r.total_respuestas) || 0,
      porcentajeUso:    Number(r.porcentaje_uso) || 0,
    }));

    return NextResponse.json(filas);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
