import { supabase } from './supabase';
import { calculateRetrieval } from './fsrs5';

/**
 * Progresión por niveles de Bloom (compuerta de aprendizaje de maestría).
 *
 * Un nivel de Bloom se considera DOMINADO —y desbloquea el siguiente— cuando
 * el estudiante ha acertado en al menos UMBRAL_DOMINIO de los ítems activos de
 * ese nivel dentro de la unidad. Acierto = rating_frs >= RATING_ACIERTO
 * (Good/Easy), el mismo umbral 0.71 que usa el juez LLM.
 *
 * La progresión es por unidad: cada unidad curricular avanza su propio nivel.
 */
export const UMBRAL_DOMINIO = 0.9; // 90 % de aciertos por nivel
export const RATING_ACIERTO = 3;

// Ítems NUEVOS introducidos por sesión (los repasos vencidos NO se topan: el
// alumno debe poder saldar toda su deuda de olvido si quiere).
export const MAX_NUEVOS = 6;

// Carga cognitiva recomendada POR ALUMNO (Teoría de Sweller). El número
// recomendado de ítems se calcula con la retención (R) y la dificultad (D)
// propias del estudiante: si retiene bien y el material le resulta fácil,
// puede con más; si olvida y le cuesta, se recomienda menos. Es una guía,
// no un límite: el alumno puede seguir si lo desea.
export const CARGA_MIN = 5;   // mínimo recomendado
export const CARGA_MAX = 15;  // máximo recomendado
export const CARGA_BASE_SIN_HISTORIAL = 8; // alumno sin repasos previos

/**
 * Nivel de Bloom máximo desbloqueado de una unidad. Recorre los niveles
 * presentes de menor a mayor y se detiene en el primero NO dominado (nivel en
 * curso); todo lo superior queda bloqueado. Si todos están dominados, devuelve
 * el mayor presente.
 *
 * @param {Array<{idItem:string, nivelBloom:number}>} items  ítems de la unidad
 * @param {Set<string>} acertados  ids de ítems con al menos un acierto histórico
 * @returns {number}
 */
export function nivelDesbloqueado(items, acertados) {
  const niveles = [...new Set(items.map((i) => i.nivelBloom))].sort((a, b) => a - b);

  for (const nivel of niveles) {
    const delNivel = items.filter((i) => i.nivelBloom === nivel);
    const aciertos = delNivel.filter((i) => acertados.has(i.idItem)).length;
    const ratio    = delNivel.length ? aciertos / delNivel.length : 1;
    if (ratio < UMBRAL_DOMINIO) return nivel; // primer nivel no dominado
  }

  return niveles.length ? niveles[niveles.length - 1] : 0;
}

/**
 * Conjunto de ítems que el estudiante ha acertado alguna vez (rating >= 3).
 * Usar el histórico hace la progresión monótona: dominar un nivel no se
 * revierte aunque un repaso posterior falle.
 *
 * @param {string} studentId
 * @param {string[]} idsItems
 * @returns {Promise<Set<string>>}
 */
export async function itemsAcertados(studentId, idsItems) {
  if (!idsItems.length) return new Set();
  const { data } = await supabase
    .from('respuesta')
    .select('id_item, rating_frs')
    .eq('id_estudiante', studentId)
    .gte('rating_frs', RATING_ACIERTO)
    .in('id_item', idsItems);
  return new Set((data ?? []).map((r) => r.id_item));
}

/**
 * Filtra las filas de item_fsrs dejando solo las cuyo nivel de Bloom está
 * desbloqueado en su unidad. Cada fila debe exponer item.id_item,
 * item.nivel_bloom e item.unidad.id_unidad.
 *
 * @param {Array} filas  filas de item_fsrs (con join a item)
 * @param {Set<string>} acertados
 * @returns {Array} subconjunto de `filas`
 */
export function filtrarPorBloom(filas, acertados) {
  const porUnidad = new Map();
  for (const r of filas) {
    const uid = r.item.unidad?.id_unidad ?? '_';
    if (!porUnidad.has(uid)) porUnidad.set(uid, []);
    porUnidad.get(uid).push({
      idItem:     r.item.id_item,
      nivelBloom: r.item.nivel_bloom,
    });
  }

  const nivelMax = new Map();
  for (const [uid, items] of porUnidad) {
    nivelMax.set(uid, nivelDesbloqueado(items, acertados));
  }

  return filas.filter((r) => {
    const uid = r.item.unidad?.id_unidad ?? '_';
    return r.item.nivel_bloom <= (nivelMax.get(uid) ?? 0);
  });
}

/**
 * Compone la sesión a partir de las filas ya filtradas por Bloom: TODOS los
 * repasos vencidos (curva de olvido, sin tope) seguidos de unos pocos ítems
 * nuevos (limitados por MAX_NUEVOS para no abrumar con material no visto).
 * El orden es el de presentación; la carga cognitiva recomendada se calcula
 * aparte (ver cargaCognitivaRecomendada) y solo orienta, no recorta.
 *
 * @param {Array} permitidos  filas de item_fsrs ya filtradas por nivel de Bloom
 * @param {string} today  fecha ISO (YYYY-MM-DD)
 * @returns {Array}
 */
export function componerSesion(permitidos, today) {
  const vencidos = permitidos.filter((r) => r.proxima_revision <= today);

  const repasos = vencidos.filter((r) => r.ultima_revision);  // ya vistos → olvido
  const nuevos  = vencidos.filter((r) => !r.ultima_revision); // nunca vistos → introducción

  // Olvido primero: lo más a punto de olvidarse (menor R) y, en empate, lo más vencido.
  repasos.sort((a, b) => {
    const dr = (a.R ?? 1) - (b.R ?? 1);
    if (dr !== 0) return dr;
    return (a.proxima_revision ?? '').localeCompare(b.proxima_revision ?? '');
  });

  // Nuevos: del nivel de Bloom más bajo hacia arriba (introducción gradual).
  nuevos.sort((a, b) => {
    const db = (a.item?.nivel_bloom ?? 0) - (b.item?.nivel_bloom ?? 0);
    if (db !== 0) return db;
    return (a.proxima_revision ?? '').localeCompare(b.proxima_revision ?? '');
  });

  // Repasos SIN tope + nuevos limitados.
  return [...repasos, ...nuevos.slice(0, MAX_NUEVOS)];
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const promedio = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// Retención REAL actual de un ítem: la R guardada se calcula justo tras el
// repaso (≈1), así que no refleja el olvido. Se recalcula con la estabilidad S
// y los días transcurridos desde la última revisión.
function retencionActual(r) {
  if (!r.ultima_revision) return 1;
  const dias = Math.max(0, (Date.now() - new Date(r.ultima_revision).getTime()) / 86400000);
  return calculateRetrieval(r.S ?? 1, dias);
}

/**
 * Carga cognitiva recomendada POR ALUMNO: cuántos ítems se le sugiere repasar
 * en la sesión para no exceder su capacidad. Se basa en sus propias variables
 * FSRS sobre los ítems ya vistos de la materia:
 *   - Retención R (qué tan bien recuerda): a mayor R, mayor capacidad.
 *   - Dificultad D (qué tan difícil le resulta, escala 1–10): a mayor D, menor.
 * Combina ambas (60 % retención, 40 % facilidad) y escala entre CARGA_MIN y
 * CARGA_MAX. Sin historial, devuelve una recomendación moderada.
 *
 * @param {Array} filas  filas de item_fsrs del alumno en la materia (con D y R)
 * @returns {number} número recomendado de ítems
 */
export function cargaCognitivaRecomendada(filas) {
  const vistos = (filas ?? []).filter((r) => r.ultima_revision);
  if (vistos.length === 0) return CARGA_BASE_SIN_HISTORIAL;

  const avgR     = promedio(vistos.map((r) => clamp01(retencionActual(r))));
  const avgDnorm = promedio(vistos.map((r) => clamp01(((r.D ?? 1) - 1) / 9))); // D 1–10 → 0–1
  const factor   = clamp01(0.6 * avgR + 0.4 * (1 - avgDnorm));

  return Math.round(CARGA_MIN + (CARGA_MAX - CARGA_MIN) * factor);
}
