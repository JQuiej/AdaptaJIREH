import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { estadoRacha } from '@/lib/streak';
import { enviarPushAUsuario } from '@/lib/push';

// Recordatorio push diario. Lo invoca Vercel Cron una vez al día a la 1:00 pm
// hora de Guatemala (19:00 UTC, ver vercel.json). Avisa a todos los alumnos con
// recordatorios activos que aún NO cumplieron su sesión de hoy. Protegido con
// CRON_SECRET (Vercel lo añade como `Authorization: Bearer <CRON_SECRET>`).
async function handler(request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { data: estudiantes, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_usuario')
      .eq('rol', 'estudiante')
      .eq('recordatorio_activo', true);
    if (error) throw error;

    let enviados = 0;
    let omitidos = 0;

    for (const e of estudiantes ?? []) {
      const { todayMet, current, goal } = await estadoRacha(e.id_usuario);
      if (todayMet) { omitidos++; continue; } // ya estudió hoy

      const n = await enviarPushAUsuario(e.id_usuario, {
        title: '¡No pierdas tu racha! 🔥',
        body: current > 0
          ? `Llevas ${current} día${current !== 1 ? 's' : ''} seguidos. Completa tu sesión de hoy (${goal} ítems) para mantenerla.`
          : `Dedica unos minutos hoy: completa ${goal} ítems y empieza tu racha de estudio.`,
        url: '/student',
      });
      if (n > 0) enviados++;
    }

    return NextResponse.json({
      candidatos: estudiantes?.length ?? 0,
      con_push_enviado: enviados,
      ya_cumplieron: omitidos,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = handler;
