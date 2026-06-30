import { supabase } from './supabase';
import { cargaCognitivaRecomendada } from './progression';

// Guatemala es UTC−6 sin horario de verano: basta restar 6 horas.
const GT_OFFSET_MS = 6 * 3600000;

/** Fecha local de Guatemala (YYYY-MM-DD) de un instante dado. */
export function fechaGT(date = new Date()) {
  return new Date(date.getTime() - GT_OFFSET_MS).toISOString().split('T')[0];
}

/** Hora local de Guatemala (0–23) de un instante dado. */
export function horaGT(date = new Date()) {
  return (date.getUTCHours() + 24 - 6) % 24;
}

/** Resta n días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function restarDias(fechaStr, n) {
  const d = new Date(`${fechaStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}

/**
 * Calcula la racha actual y la mejor racha a partir del conjunto de días
 * cumplidos (Set de 'YYYY-MM-DD'). La racha actual cuenta hacia atrás desde
 * HOY; si hoy aún no se cumple, sigue contando desde ayer (no se rompe hasta
 * que pase un día completo sin cumplir).
 *
 * @param {Set<string>} diasCumplidos
 * @param {string} hoy  fecha GT de hoy
 * @returns {{ current:number, best:number }}
 */
export function calcularRacha(diasCumplidos, hoy) {
  // Racha actual
  let current = 0;
  let cursor = diasCumplidos.has(hoy) ? hoy : restarDias(hoy, 1);
  while (diasCumplidos.has(cursor)) {
    current++;
    cursor = restarDias(cursor, 1);
  }

  // Mejor racha (recorrido por las fechas ordenadas)
  const fechas = [...diasCumplidos].sort();
  let best = 0, run = 0, prev = null;
  for (const f of fechas) {
    run = (prev && restarDias(f, 1) === prev) ? run + 1 : 1;
    if (run > best) best = run;
    prev = f;
  }

  return { current, best };
}

/**
 * Estado de la racha de un alumno: meta diaria (carga cognitiva recomendada
 * sobre TODOS sus ítems), ítems respondidos hoy, si cumplió hoy, y rachas.
 *
 * @param {string} studentId
 * @returns {Promise<{ goal:number, todayCount:number, todayMet:boolean, current:number, best:number }>}
 */
export async function estadoRacha(studentId) {
  const hoy = fechaGT();

  // Meta diaria = sesión recomendada según las variables FSRS del alumno.
  const { data: fsrsRows } = await supabase
    .from('item_fsrs')
    .select('ultima_revision, D:d, S:s, R:r')
    .eq('id_estudiante', studentId);
  const goal = Math.max(1, cargaCognitivaRecomendada(fsrsRows ?? []));

  // Ítems respondidos por día (de la tabla de respuestas).
  const { data: resp } = await supabase
    .from('respuesta')
    .select('timestamp_resp')
    .eq('id_estudiante', studentId);

  const conteoPorDia = new Map();
  for (const r of resp ?? []) {
    if (!r.timestamp_resp) continue;
    const f = fechaGT(new Date(r.timestamp_resp));
    conteoPorDia.set(f, (conteoPorDia.get(f) ?? 0) + 1);
  }

  const diasCumplidos = new Set(
    [...conteoPorDia.entries()].filter(([, n]) => n >= goal).map(([f]) => f)
  );

  const todayCount = conteoPorDia.get(hoy) ?? 0;
  const todayMet   = todayCount >= goal;
  const { current, best } = calcularRacha(diasCumplidos, hoy);

  return { goal, todayCount, todayMet, current, best };
}
