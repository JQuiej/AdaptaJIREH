/**
 * Seed de USO SIMULADO — genera 14 días de actividad realista para N usuarios
 * de prueba (por defecto est001, est002, est003).
 *
 * Ejecutar:
 *   node supabase/scripts/seed-sesiones.mjs
 *   node supabase/scripts/seed-sesiones.mjs est004 est005 est006
 *   node supabase/scripts/seed-sesiones.mjs --dias 14 --reset est001 est002 est003
 *
 * Qué hace:
 *   Recorre 14 días hacia atrás (terminando hoy) y, para cada estudiante,
 *   simula sesiones de repaso creíbles sobre los ítems que REALMENTE ve
 *   (activos, de temas visibles, de sus materias inscritas). Por cada ítem
 *   corre el MISMO algoritmo FSRS-5 de la app (lib/fsrs5.js) y deriva las
 *   mismas variables de investigación que lib/telemetry.js, insertando filas
 *   en `sesion` y `respuesta` con marcas de tiempo retro-fechadas, y dejando
 *   `item_fsrs` en su estado final coherente.
 *
 *   Cada estudiante tiene un PERFIL distinto (constante/alto, mejora desde
 *   bajo, irregular/medio) para que los datos tengan varianza realista.
 *
 * Notas:
 *   · Idempotencia: por defecto AÑADE sobre lo que exista. Con `--reset`
 *     BORRA primero las sesiones/respuestas/estado FSRS de esos estudiantes
 *     (acción destructiva, explícita) para regenerar limpio.
 *   · Determinista: usa un PRNG con semilla, así que dos corridas producen
 *     los mismos datos (cambia SEED para variar).
 *   · No llama a Gemini ni al juez LLM: los puntajes de corrección/SST se
 *     simulan; el resto (FSRS, variables) es idéntico al de producción.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  updateFSRS,
  ratingFromSST,
  calculateRetrieval,
} from '../../lib/fsrs5.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuración ────────────────────────────────────────────
const SEED_BASE   = 20260710;      // semilla del PRNG (cambia para otros datos)
const HORA_MIN    = 13;            // franja horaria UTC de estudio (mismo día UTC)
const HORA_MAX    = 19;
const NUEVOS_POR_DIA = 4;          // ítems nuevos introducidos por materia/día
const SESION_MAX  = 12;            // tope de ítems por sesión (afecta CE)

// ── Perfiles de estudiante (se asignan cíclicamente) ─────────
// Calibrados para dar un abanico creíble de PRECISIÓN (PA) con temas de Bloom
// alto (3–4): fuerte → media/alta, medio → media, débil → baja pero con curva
// de aprendizaje ascendente. `pistaProb` se mantiene bajo porque cada uso de
// pista fuerza PA=0 (por definición, "sin pista").
const PERFILES = [
  { nombre: 'constante-alto',   estudiaProb: 0.85, habilidad: 0.95, mejora: 0.006, pistaProb: 0.03, matProb: 0.75 },
  { nombre: 'mejora-desde-bajo', estudiaProb: 0.75, habilidad: 0.52, mejora: 0.024, pistaProb: 0.07, matProb: 0.70 },
  { nombre: 'irregular-medio',  estudiaProb: 0.58, habilidad: 0.85, mejora: 0.010, pistaProb: 0.05, matProb: 0.65 },
];

// ── Utilidades ───────────────────────────────────────────────
function cargarEnv() {
  try {
    const texto = readFileSync(resolve(__dirname, '../../.env.local'), 'utf8');
    for (const linea of texto.split('\n')) {
      const t = linea.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx === -1) continue;
      const clave = t.slice(0, idx).trim();
      const valor = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {
    console.warn('No se pudo leer .env.local; se usarán las variables del entorno.');
  }
}

// PRNG determinista (mulberry32)
function crearRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crearAleatorios(rng) {
  const rand = () => rng();
  const uniforme = (lo, hi) => lo + (hi - lo) * rand();
  const entero = (lo, hi) => Math.floor(uniforme(lo, hi + 1));
  const chance = (p) => rand() < p;
  // Gaussiana Box–Muller
  const gauss = (mu = 0, sigma = 1) => {
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const barajar = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return { rand, uniforme, entero, chance, gauss, barajar };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r4 = (n) => Math.round(n * 10000) / 10000;
const addDaysStr = (dateStr, dias) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
};

// Igual que lib/telemetry.js — CE: baja <10 · media 10–20 · alta >20 ítems
function classifyWorkload(totalItems) {
  if (totalItems < 10) return 'low';
  if (totalItems <= 20) return 'medium';
  return 'high';
}
// Igual que lib/nlp.js → classifyFeedback
function classifyFeedback(score) {
  if (score >= 0.71) return 'basic';
  if (score >= 0.41) return 'explanatory';
  return 'generative';
}
// Igual que lib/telemetry.js → esItemDeTransferencia
const esTransferencia = (bloom) => bloom === 3 || bloom === 4;

// ── Programa principal ───────────────────────────────────────
async function main() {
  cargarEnv();

  // Argumentos
  const args = process.argv.slice(2);
  let dias = 14;
  let reset = false;
  const usuarios = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--reset') reset = true;
    else if (a === '--dias') { dias = parseInt(args[++i], 10) || 14; }
    else usuarios.push(a);
  }
  if (usuarios.length === 0) usuarios.push('est001', 'est002', 'est003');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  }
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log(`\nSeed de uso simulado — ${dias} días · usuarios: ${usuarios.join(', ')}` +
              (reset ? ' · MODO RESET (borra datos previos)' : ' · modo añadir'));

  // Fechas: los últimos `dias` días terminando hoy (UTC)
  const hoy = new Date();
  const fechas = [];
  for (let d = dias - 1; d >= 0; d--) {
    const f = new Date(hoy.getTime() - d * 86400000);
    fechas.push(f.toISOString().split('T')[0]);
  }

  for (let idxUser = 0; idxUser < usuarios.length; idxUser++) {
    const username = usuarios[idxUser];
    const perfil = PERFILES[idxUser % PERFILES.length];
    const rng = crearRng(SEED_BASE + idxUser * 7919);
    const R = crearAleatorios(rng);

    // 1) Usuario
    const { data: usuario, error: uErr } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_usuario, rol')
      .eq('nombre_usuario', username)
      .single();
    if (uErr || !usuario) {
      console.warn(`  · ${username}: no existe, se omite.`);
      continue;
    }
    if (usuario.rol !== 'estudiante') {
      console.warn(`  · ${username}: no es estudiante, se omite.`);
      continue;
    }
    const studentId = usuario.id_usuario;

    // 2) Materias inscritas y activas
    const { data: insc } = await supabase
      .from('inscripcion')
      .select('materia:materia!id_materia(id_materia, nombre, activa)')
      .eq('id_estudiante', studentId);
    const materias = (insc ?? []).map((i) => i.materia).filter((m) => m?.activa);
    if (materias.length === 0) {
      console.warn(`  · ${username}: sin materias inscritas activas, se omite.`);
      continue;
    }
    const materiaIds = materias.map((m) => m.id_materia);

    // 3) Ítems visibles/activos de esas materias (lo que el alumno realmente ve)
    const { data: itemsRaw } = await supabase
      .from('item')
      .select(`
        id_item, nivel_bloom, activo,
        unidad:unidad_curricular!id_unidad(id_unidad, id_materia, visible)
      `)
      .eq('activo', true);

    const items = (itemsRaw ?? []).filter(
      (it) => it.unidad?.visible && materiaIds.includes(it.unidad?.id_materia)
    ).map((it) => ({
      id_item:   it.id_item,
      bloom:     it.nivel_bloom,
      id_materia: it.unidad.id_materia,
    }));

    if (items.length === 0) {
      console.warn(`  · ${username}: no hay ítems visibles/activos en sus materias, se omite.`);
      continue;
    }

    // 4) (Opcional) reset destructivo del historial de este alumno
    if (reset) {
      // respuesta cae en cascada al borrar sesión; item_fsrs se borra aparte
      await supabase.from('sesion').delete().eq('id_estudiante', studentId);
      await supabase.from('item_fsrs').delete().eq('id_estudiante', studentId);
    }

    // Estado FSRS en memoria por ítem (arranca vacío = alumno nuevo)
    const estado = new Map(); // id_item → { D,S,R,total, ultima(epoch|null), proxima(dateStr|null), introducido }
    for (const it of items) {
      estado.set(it.id_item, { D: null, S: null, R: null, total: 0, ultima: null, proxima: null, introducido: false });
    }
    // Cola de introducción de ítems nuevos por materia (barajada)
    const nuevosPorMateria = {};
    for (const mid of materiaIds) {
      nuevosPorMateria[mid] = R.barajar(items.filter((it) => it.id_materia === mid).map((it) => it.id_item));
    }

    const itemPorId = new Map(items.map((it) => [it.id_item, it]));

    let totalSesiones = 0, totalRespuestas = 0, sumaPA = 0, nPA = 0, diasActivos = 0;

    // 5) Recorrer los días
    for (let di = 0; di < fechas.length; di++) {
      const fecha = fechas[di];
      if (!R.chance(perfil.estudiaProb)) continue; // día sin estudiar
      let estudioAlgo = false;

      for (const materia of R.barajar(materias)) {
        if (!R.chance(perfil.matProb)) continue; // no toca esta materia hoy
        const mid = materia.id_materia;

        // Ítems vencidos (ya introducidos, proxima <= fecha)
        const vencidos = items
          .filter((it) => it.id_materia === mid)
          .filter((it) => {
            const e = estado.get(it.id_item);
            return e.introducido && e.proxima && e.proxima <= fecha;
          })
          .map((it) => it.id_item);

        // Ítems nuevos a introducir hoy
        const cola = nuevosPorMateria[mid];
        const nNuevos = Math.min(NUEVOS_POR_DIA, cola.length);
        const nuevos = cola.splice(0, nNuevos);

        let listaSesion = R.barajar([...vencidos, ...nuevos]).slice(0, SESION_MAX);
        if (listaSesion.length === 0) continue;

        const totalItems = listaSesion.length;
        const CE = classifyWorkload(totalItems);

        // Reloj de la sesión (UTC, mismo día)
        const horaIni = R.entero(HORA_MIN, HORA_MAX);
        const minIni = R.entero(0, 55);
        let reloj = new Date(`${fecha}T${String(horaIni).padStart(2, '0')}:${String(minIni).padStart(2, '0')}:00Z`).getTime();
        const horaInicioIso = new Date(reloj).toISOString();

        // Crear sesión (necesitamos su id para las respuestas)
        const { data: sesRow, error: sErr } = await supabase
          .from('sesion')
          .insert({
            id_estudiante: studentId,
            id_materia: mid,
            fecha,
            hora_inicio: horaInicioIso,
            total_items: totalItems,
            items_completados: totalItems,
          })
          .select('id_sesion')
          .single();
        if (sErr || !sesRow) {
          console.error(`    error creando sesión (${username}, ${fecha}): ${sErr?.message}`);
          continue;
        }

        // Habilidad del alumno ese día (curva de aprendizaje + ruido)
        const habilidadHoy = clamp(perfil.habilidad + perfil.mejora * di + R.gauss(0, 0.05), 0.05, 0.97);

        const respuestas = [];

        for (const itemId of listaSesion) {
          const it = itemPorId.get(itemId);
          const e = estado.get(itemId);
          const esNuevo = !e.introducido;

          // Retenibilidad previa (decae con los días desde el último repaso)
          const diasDesde = e.ultima ? Math.max(0, (reloj - e.ultima) / 86400000) : 0;
          const previousR = e.ultima ? calculateRetrieval(e.S ?? 1, diasDesde) : 1;

          // Adherencia al repaso (AR): a tiempo si hoy <= proxima programada
          const onTime = !e.proxima || fecha <= e.proxima;

          // Probabilidad de acierto del alumno para este ítem.
          //   · La exigencia ESTABLE del ítem la fija su nivel de Bloom (no la D
          //     de FSRS). Usar la D cruda genera una "espiral de fracaso": fallar
          //     sube D → el ítem se vuelve más difícil → se falla más → D sube
          //     aún más, hundiendo la precisión de forma irreal.
          //   · La D de FSRS solo aporta un empujón PEQUEÑO y ACOTADO alrededor
          //     del valor neutro (D=5), para que conserve algo de correlación con
          //     el estado del ítem sin retroalimentarse.
          //   · La práctica repetida (familiaridad) sube la probabilidad → se ve
          //     la curva de aprendizaje.
          const difBloom     = (it.bloom - 1) / 3;                               // 0 (Bloom1) … 1 (Bloom4)
          const difDinamica  = esNuevo ? 0 : clamp(((e.D ?? 5) - 5) / 10, -0.2, 0.2);
          const familiaridad = Math.min(0.25, e.total * 0.05);
          let media = 0.35 + 0.70 * habilidadHoy - 0.30 * difBloom - 0.50 * difDinamica + familiaridad;
          media = clamp(media, 0.05, 0.97);

          // ¿Usó pista? Más probable en ítems de mayor Bloom y en los nuevos.
          const usedHint = R.chance(clamp(perfil.pistaProb * (0.6 + difBloom) + (esNuevo ? 0.05 : 0), 0, 0.6));

          // Puntaje de corrección del juez y SST por embeddings
          let gradeScore = clamp(media + R.gauss(0, 0.14), 0.03, 0.99);
          if (usedHint) gradeScore = clamp(gradeScore + 0.12, 0.03, 0.99); // la pista ayuda a acertar
          const sstScore = clamp(gradeScore + R.gauss(0, 0.09), 0, 1);

          const rating = ratingFromSST(gradeScore); // 1..3 (Easy no se infiere)
          const acierto = rating >= 3 ? 1 : 0;

          // Tiempo de respuesta (ms) — más lento si difícil/nuevo/olvidado
          let ms = 4000
            + difBloom * 11000
            + (it.bloom - 1) * 1500
            + (rating === 1 ? 8000 : rating === 2 ? 4000 : 0)
            - Math.min(3000, e.total * 600)
            + (esNuevo ? 4000 : 0)
            + (usedHint ? 6000 : 0);
          ms = ms * Math.exp(R.gauss(0, 0.28));
          const tiempoMs = Math.round(clamp(ms, 1500, 90000));

          // FSRS-5: mismo cálculo que la app
          const nf = updateFSRS(e.D, e.S, previousR, rating, e.total);
          // La próxima revisión se ancla al DÍA de la sesión (no a "hoy real")
          const proximaSes = addDaysStr(fecha, nf.ire_days);

          // Variables de investigación (idéntico a lib/telemetry.js)
          const PA = usedHint ? 0 : acierto;
          const AR = onTime ? 1 : 0;
          const TR = esTransferencia(it.bloom) ? acierto : null;
          const retencionDecaida = e.ultima ? r4(previousR) : null;
          const diasDesdeRepaso = e.ultima ? Math.round(diasDesde * 100) / 100 : null;

          respuestas.push({
            id_sesion: sesRow.id_sesion,
            id_item: itemId,
            id_estudiante: studentId,
            respuesta_texto: '',            // texto real del alumno no se simula
            tiempo_respuesta_ms: tiempoMs,  // → LR = ms/1000
            timestamp_resp: new Date(reloj).toISOString(),
            sst: r4(sstScore),
            ire_dias: nf.ire_days,
            d_post: nf.difficulty,
            s_post: nf.stability,
            ce: CE,
            dd: it.bloom,
            cr: classifyFeedback(gradeScore),
            tr: TR,
            pa: PA,
            ar: AR,
            uso_pista: usedHint,
            rating_frs: rating,
            retencion_decaida: retencionDecaida,
            dias_desde_repaso: diasDesdeRepaso,
          });

          // Avanzar el estado FSRS en memoria
          e.D = nf.difficulty;
          e.S = nf.stability;
          e.R = nf.retrievability;
          e.total += 1;
          e.ultima = reloj;
          e.proxima = proximaSes;
          e.introducido = true;

          sumaPA += PA; nPA += 1;

          // Avanzar reloj: responder + leer/transición
          reloj += tiempoMs + R.entero(3000, 9000);
        }

        // Insertar respuestas en lote
        const { error: rErr } = await supabase.from('respuesta').insert(respuestas);
        if (rErr) {
          console.error(`    error insertando respuestas (${username}, ${fecha}): ${rErr.message}`);
        }

        // Cerrar sesión con duración real
        const horaFin = new Date(reloj).toISOString();
        const duracionMin = Math.round(((reloj - new Date(horaInicioIso).getTime()) / 60000) * 100) / 100;
        await supabase.from('sesion').update({ hora_fin: horaFin, duracion_min: duracionMin }).eq('id_sesion', sesRow.id_sesion);

        totalSesiones += 1;
        totalRespuestas += respuestas.length;
        estudioAlgo = true;
      }

      if (estudioAlgo) diasActivos += 1;
    }

    // 6) Volcar el estado FSRS final por ítem (último valor gana)
    const finales = new Map();
    for (const [itemId, e] of estado) {
      if (e.introducido) {
        finales.set(itemId, {
          id_item: itemId,
          id_estudiante: studentId,
          d: e.D, s: e.S, r: e.R,
          proxima_revision: e.proxima,
          ultima_revision: new Date(e.ultima).toISOString(),
          total_repasos: e.total,
        });
      }
    }
    if (finales.size > 0) {
      const { error: fErr } = await supabase
        .from('item_fsrs')
        .upsert([...finales.values()], { onConflict: 'id_item,id_estudiante' });
      if (fErr) console.error(`    error en item_fsrs (${username}): ${fErr.message}`);
    }

    const paProm = nPA ? (sumaPA / nPA) : 0;
    console.log(
      `  · ${username} [${perfil.nombre}]: ${diasActivos}/${dias} días activos · ` +
      `${totalSesiones} sesiones · ${totalRespuestas} respuestas · ` +
      `PA prom ${(paProm * 100).toFixed(0)}% · ${finales.size} ítems con estado FSRS`
    );
  }

  console.log('\nListo.\n');
}

main().catch((err) => {
  console.error('Falló el seed de sesiones:', err.message);
  process.exit(1);
});
