import { supabase } from './supabase';
import {
  cargaCognitivaRecomendada,
  itemsAcertados,
  filtrarPorBloom,
  componerSesion,
} from './progression';

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
 * Estado de la racha de un alumno: meta diaria, ítems respondidos hoy, si
 * cumplió hoy, y rachas.
 *
 * La meta es la carga cognitiva recomendada según las variables FSRS del alumno,
 * pero SIEMPRE limitada por lo que realmente puede completar hoy: la sesión
 * disponible (repasos vencidos + ítems nuevos, con la compuerta de Bloom y el
 * tope de ítems nuevos por sesión). Así la racha nunca pide más ítems de los que
 * el alumno tiene desbloqueados/disponibles, que era el problema: pedía 13
 * cuando solo había ~10 ítems accesibles y era imposible cumplirla.
 *
 * @param {string} studentId
 * @returns {Promise<{ goal:number, todayCount:number, todayMet:boolean, current:number, best:number }>}
 */
export async function estadoRacha(studentId) {
  const hoy = fechaGT();
  // Misma fecha que usa la sesión del alumno (endpoint /fsrs/pending) para que
  // «lo disponible hoy» coincida con lo que realmente se le presenta.
  const today = new Date().toISOString().split('T')[0];

  // Ítems del alumno con lo necesario para la compuerta de Bloom, la carga
  // cognitiva y la composición de la sesión.
  const { data: fsrsData } = await supabase
    .from('item_fsrs')
    .select(`
      id_registro, D:d, S:s, R:r, proxima_revision, ultima_revision,
      item:item!id_item(
        id_item, nivel_bloom, activo,
        unidad:unidad_curricular!id_unidad(id_unidad, visible)
      )
    `)
    .eq('id_estudiante', studentId);

  // Solo ítems activos y de temas visibles (los ocultos no entran a la sesión).
  const filas = (fsrsData ?? []).filter((r) => r.item?.activo && r.item?.unidad?.visible);

  // Meta bruta según la carga cognitiva del alumno.
  const cargaBruta = cargaCognitivaRecomendada(filas);

  // Sesión realmente disponible hoy (misma lógica que /fsrs/pending).
  const acertados  = await itemsAcertados(studentId, filas.map((r) => r.item.id_item));
  const permitidos = filtrarPorBloom(filas, acertados);
  const sesion     = componerSesion(permitidos, today);

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

  const todayCount = conteoPorDia.get(hoy) ?? 0;

  // Capacidad del día = lo ya respondido hoy + lo que aún queda por responder.
  // Al responder, un ítem sale de la sesión y entra a todayCount, así la
  // capacidad se mantiene estable durante el día (la meta no salta de la nada).
  const capacidad = todayCount + sesion.length;

  // Día de descanso: el alumno no tiene NADA que repasar hoy (ni respondió ni le
  // quedan ítems disponibles). No depende de él, así que no debe romper la racha:
  // se registra para poder «puentearlo» y se considera cumplido.
  const esDiaDescanso = capacidad === 0;
  if (esDiaDescanso) {
    await supabase
      .from('dia_sin_pendientes')
      .upsert({ id_estudiante: studentId, fecha: hoy }, { onConflict: 'id_estudiante,fecha', ignoreDuplicates: true });
  }

  // Meta para JUZGAR si un día con respuestas cuenta como cumplido. Siempre ≥ 1
  // (nunca 0, aun en día de descanso) para no descartar los días ya cumplidos al
  // evaluar la racha. Sin sesión hoy, no se topa por capacidad.
  const goalJuicio = Math.max(1, Math.min(cargaBruta, capacidad || cargaBruta));
  // Meta MOSTRADA al alumno hoy: en un día de descanso no hay nada que hacer (0).
  const goal = esDiaDescanso ? 0 : goalJuicio;

  // Días de descanso ya registrados (incluye días pasados sin pendientes).
  const { data: descansos } = await supabase
    .from('dia_sin_pendientes')
    .select('fecha')
    .eq('id_estudiante', studentId);

  // Días que mantienen la racha: los que cumplieron la meta + los de descanso.
  const diasCumplidos = new Set(
    [...conteoPorDia.entries()].filter(([, n]) => n >= goalJuicio).map(([f]) => f)
  );
  for (const d of descansos ?? []) if (d.fecha) diasCumplidos.add(d.fecha);

  const todayMet = esDiaDescanso || todayCount >= goalJuicio;
  const { current, best } = calcularRacha(diasCumplidos, hoy);

  return { goal, todayCount, todayMet, current, best };
}
