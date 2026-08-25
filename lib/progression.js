import { supabase } from './supabase';
import { calculateRetrieval } from './fsrs5';

/**
 * Progresión por niveles de Bloom (compuerta de aprendizaje de maestría).
 *
 * Un nivel de Bloom se considera DOMINADO —y desbloquea el siguiente— cuando
 * el estudiante ha acertado en al menos UMBRAL_DOMINIO de los ítems de ese
 * nivel QUE HA INTENTADO dentro de la unidad, habiendo intentado al menos
 * MIN_INTENTOS_NIVEL de ellos. Acierto = rating_frs >= RATING_ACIERTO
 * (Good/Easy), el mismo umbral 0.71 que usa el juez LLM.
 *
 * El ratio se mide sobre los ítems INTENTADOS, no sobre todos los del nivel:
 * de otro modo un ítem que el alumno aún no ha visto cuenta como fallo y la
 * compuerta se vuelve inalcanzable (en una unidad de 5 ítems exigía acertar
 * los 5). El mínimo de intentos evita el otro extremo: desbloquear un nivel
 * con evidencia de un solo acierto.
 *
 * La progresión es por unidad: cada unidad curricular avanza su propio nivel.
 */
export const UMBRAL_DOMINIO = 0.7;      // 70 % de aciertos entre los intentados
export const MIN_INTENTOS_NIVEL = 3;    // evidencia mínima antes de desbloquear
export const RATING_ACIERTO = 3;

// Ítems NUEVOS introducidos por sesión (los repasos vencidos NO se topan: el
// alumno debe poder saldar toda su deuda de olvido si quiere).
export const MAX_NUEVOS = 6;

// ── Prioridad de transferencia (Bloom 3 y 4) ────────────────────────────────
// Los ítems de análisis/creación son los que miden la variable TR (índice de
// transferencia). Sin reserva explícita nunca alcanzan la pantalla: la cola
// empieza por todos los repasos vencidos (mediana ~26 por alumno) mientras que
// la carga recomendada es de 5 a 15 ítems, así que el alumno termina su sesión
// mucho antes de llegar al material nuevo. Por eso se reservan posiciones
// TEMPRANAS para ellos en vez de dejarlos al final.
export const BLOOM_TRANSFERENCIA = 3;   // nivel a partir del cual hay prioridad
export const CUPO_TRANSFERENCIA = 3;    // ítems nuevos de Bloom alto por sesión

// ATAJO DE TRANSFERENCIA: con al menos ATAJO_ACIERTOS_BLOOM2 aciertos en ítems
// de Bloom 2 de la unidad, se abren de una vez los niveles 3 y 4, sin exigir
// que el alumno complete el nivel 2 según la regla general. Es un ajuste
// deliberado de la progresión para poder medir la variable TR (transferencia):
// con la compuerta secuencial, 0 de 5 191 respuestas llegaron a Bloom 4.
export const ATAJO_ACIERTOS_BLOOM2 = 2;
export const BLOOM_ATAJO = 2;           // nivel donde se cuentan esos aciertos

// Los ítems NUEVOS también se intercalan (antes iban después de TODOS los
// repasos vencidos, fuera del alcance real de la sesión). Sin esto el alumno
// no avanza de nivel: se queda repasando el mismo material de Bloom 1 y nunca
// acumula los intentos que la compuerta exige para desbloquear el siguiente.
export const PASO_NUEVOS = 4;           // uno de cada 4 lugares de la cola base

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
 * @param {Set<string>} [intentados]  ids de ítems respondidos alguna vez; si se
 *        omite, se evalúa sobre todos los ítems del nivel (comportamiento previo)
 * @returns {number}
 */
export function nivelDesbloqueado(items, acertados, intentados) {
  const niveles = [...new Set(items.map((i) => i.nivelBloom))].sort((a, b) => a - b);
  const maximo  = niveles.length ? niveles[niveles.length - 1] : 0;

  // Atajo de transferencia: con evidencia de comprensión en Bloom 2, se abren
  // los niveles altos aunque el nivel 2 no esté completo según la regla general.
  const aciertosBloom2 = items.filter(
    (i) => i.nivelBloom === BLOOM_ATAJO && acertados.has(i.idItem)
  ).length;
  if (aciertosBloom2 >= ATAJO_ACIERTOS_BLOOM2) return maximo;

  for (const nivel of niveles) {
    const delNivel = items.filter((i) => i.nivelBloom === nivel);
    const conIntento = intentados
      ? delNivel.filter((i) => intentados.has(i.idItem))
      : delNivel;

    // Sin evidencia suficiente, el nivel sigue en curso.
    const minimo = Math.min(MIN_INTENTOS_NIVEL, delNivel.length);
    if (conIntento.length < minimo) return nivel;

    const aciertos = conIntento.filter((i) => acertados.has(i.idItem)).length;
    const ratio    = conIntento.length ? aciertos / conIntento.length : 1;
    if (ratio < UMBRAL_DOMINIO) return nivel; // primer nivel no dominado
  }

  return maximo;
}

/**
 * Historial del estudiante sobre un conjunto de ítems: cuáles ha respondido
 * alguna vez (`intentados`) y cuáles ha acertado alguna vez (`acertados`,
 * rating >= RATING_ACIERTO). Usar el histórico hace la progresión monótona:
 * dominar un nivel no se revierte aunque un repaso posterior falle.
 *
 * @param {string} studentId
 * @param {string[]} idsItems
 * @returns {Promise<{intentados: Set<string>, acertados: Set<string>}>}
 */
export async function historialItems(studentId, idsItems) {
  const vacio = { intentados: new Set(), acertados: new Set() };
  if (!idsItems.length) return vacio;

  const { data } = await supabase
    .from('respuesta')
    .select('id_item, rating_frs')
    .eq('id_estudiante', studentId)
    .in('id_item', idsItems);

  const intentados = new Set();
  const acertados  = new Set();
  for (const r of data ?? []) {
    intentados.add(r.id_item);
    if (r.rating_frs >= RATING_ACIERTO) acertados.add(r.id_item);
  }
  return { intentados, acertados };
}

/**
 * Filtra las filas de item_fsrs dejando solo las cuyo nivel de Bloom está
 * desbloqueado en su unidad. Cada fila debe exponer item.id_item,
 * item.nivel_bloom e item.unidad.id_unidad.
 *
 * @param {Array} filas  filas de item_fsrs (con join a item)
 * @param {Set<string>} acertados
 * @param {Set<string>} [intentados]
 * @returns {Array} subconjunto de `filas`
 */
export function filtrarPorBloom(filas, acertados, intentados) {
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
    nivelMax.set(uid, nivelDesbloqueado(items, acertados, intentados));
  }

  return filas.filter((r) => {
    const uid = r.item.unidad?.id_unidad ?? '_';
    return r.item.nivel_bloom <= (nivelMax.get(uid) ?? 0);
  });
}

const esTransferencia = (r) => (r.item?.nivel_bloom ?? 0) >= BLOOM_TRANSFERENCIA;

/**
 * Intercala los ítems de `extras` dentro de `base` colocando uno cada `paso`
 * posiciones, para que no queden detrás de toda la deuda de repasos.
 */
function intercalar(base, prioritarios, paso) {
  if (!prioritarios.length) return base;
  if (!base.length) return prioritarios;

  const salida = [];
  let i = 0;
  let j = 0;
  while (i < base.length || j < prioritarios.length) {
    const tocaPrioritario = (salida.length + 1) % paso === 0;
    if (j < prioritarios.length && (tocaPrioritario || i >= base.length)) salida.push(prioritarios[j++]);
    else salida.push(base[i++]);
  }
  return salida;
}

/**
 * Reparte las filas alternando entre los niveles de Bloom presentes, del más
 * alto al más bajo (4, 3, 4, 3...). Dentro de cada nivel conserva el orden por
 * fecha de revisión.
 */
function alternarPorNivel(filas) {
  const porNivel = new Map();
  for (const r of filas) {
    const n = r.item?.nivel_bloom ?? 0;
    if (!porNivel.has(n)) porNivel.set(n, []);
    porNivel.get(n).push(r);
  }

  const grupos = [...porNivel.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, rs]) => rs.sort((a, b) =>
      (a.proxima_revision ?? '').localeCompare(b.proxima_revision ?? '')));

  const salida = [];
  for (let i = 0; salida.length < filas.length; i++) {
    for (const g of grupos) if (i < g.length) salida.push(g[i]);
  }
  return salida;
}

/**
 * Compone la sesión a partir de las filas ya filtradas por Bloom: TODOS los
 * repasos vencidos (curva de olvido, sin tope) más unos pocos ítems nuevos
 * (limitados por MAX_NUEVOS para no abrumar con material no visto).
 *
 * Los ítems de transferencia (Bloom >= BLOOM_TRANSFERENCIA) van AL PRINCIPIO
 * de la cola, antes de cualquier repaso de nivel bajo: son los primeros que ve
 * el alumno, de modo que caen siempre dentro de su carga alcanzable. Del
 * presupuesto de ítems nuevos se les reservan hasta CUPO_TRANSFERENCIA lugares.
 *
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

  // Nuevos de transferencia: alternando entre niveles (4, 3, 4, 3...) para
  // acumular evidencia de transferencia LEJANA (Bloom 4) y CERCANA (Bloom 3)
  // por igual; ordenarlos solo por nivel descendente dejaría Bloom 3 sin datos.
  const nuevosTransf = alternarPorNivel(nuevos.filter(esTransferencia));

  // Nuevos de base: del nivel de Bloom más bajo hacia arriba (introducción gradual).
  const nuevosBase = nuevos.filter((r) => !esTransferencia(r)).sort((a, b) => {
    const db = (a.item?.nivel_bloom ?? 0) - (b.item?.nivel_bloom ?? 0);
    if (db !== 0) return db;
    return (a.proxima_revision ?? '').localeCompare(b.proxima_revision ?? '');
  });

  // Presupuesto de nuevos: se reserva primero el cupo de transferencia.
  const transfElegidos = nuevosTransf.slice(0, CUPO_TRANSFERENCIA);
  const baseElegidos   = nuevosBase.slice(0, Math.max(0, MAX_NUEVOS - transfElegidos.length));

  // Cabeza de la sesión: todo lo de transferencia. Primero los repasos de
  // Bloom alto (miden TR y además están sujetos al olvido) y luego los nuevos.
  const cabeza = [...repasos.filter(esTransferencia), ...transfElegidos];

  // Cola base: repasos de Bloom bajo con los ítems nuevos intercalados, para
  // que el alumno vea material nuevo aunque arrastre mucha deuda de repaso.
  const base = intercalar(
    repasos.filter((r) => !esTransferencia(r)),
    baseElegidos,
    PASO_NUEVOS
  );

  return [...cabeza, ...base];
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
