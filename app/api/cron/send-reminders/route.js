import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { estadoRacha } from '@/lib/streak';
import { enviarPushAUsuario } from '@/lib/push';

// Recordatorio push diario. Lo invoca Vercel Cron (ver vercel.json) DOS veces al
// día en hora de Guatemala: a la 1:00 pm (turno mediodía) y a las 7:00 pm (turno
// tarde, «última llamada» por si no completaron con el primero). Ambos avisan
// solo a los alumnos con recordatorios activos que aún NO cumplieron su sesión de
// hoy. El turno se pasa por query string (?turno=tarde) y solo cambia el texto.
// Protegido con CRON_SECRET (Vercel lo añade como `Authorization: Bearer <CRON_SECRET>`).
function mensajeRecordatorio(turno, { current, goal }) {
  if (turno === 'tarde') {
    return {
      title: '⏰ ¡Última llamada para tu racha! 🔥',
      body: current > 0
        ? `Aún estás a tiempo hoy: completa tu sesión (${goal} ítems) y no pierdas tus ${current} día${current !== 1 ? 's' : ''} de racha.`
        : `Todavía puedes lograrlo: completa ${goal} ítems antes de que termine el día y empieza tu racha.`,
      url: '/student',
    };
  }
  return {
    title: '¡No pierdas tu racha! 🔥',
    body: current > 0
      ? `Llevas ${current} día${current !== 1 ? 's' : ''} seguidos. Completa tu sesión de hoy (${goal} ítems) para mantenerla.`
      : `Dedica unos minutos hoy: completa ${goal} ítems y empieza tu racha de estudio.`,
    url: '/student',
  };
}

async function handler(request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // 'tarde' → recordatorio de las 7:00 pm (última llamada); si no, mediodía.
    const turno = new URL(request.url).searchParams.get('turno') ?? 'mediodia';

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

      const n = await enviarPushAUsuario(e.id_usuario, mensajeRecordatorio(turno, { current, goal }));
      if (n > 0) enviados++;
    }

    return NextResponse.json({
      turno,
      candidatos: estudiantes?.length ?? 0,
      con_push_enviado: enviados,
      ya_cumplieron: omitidos,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = handler;
