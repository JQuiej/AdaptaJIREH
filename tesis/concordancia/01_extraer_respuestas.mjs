/**
 * Extrae respuestas abiertas REALES ya evaluadas por el juez LLM (grade_score
 * no nulo) para el estudio de concordancia docente–sistema.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ROOT = 'C:/Users/Quiej/Documents/Universidad 9no. semestre/Proyecto de Graduacion/Sistema AdaptaJIREH';
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from('respuesta')
  .select(`
    id_respuesta, respuesta_texto, grade_score, sst, rating_frs, uso_pista,
    tiempo_respuesta_ms, timestamp_resp,
    usuario:usuario!respuesta_id_estudiante_fkey ( codigo_anonimo, grado ),
    item:item!inner (
      id_item, pregunta, respuesta_ref, nivel_bloom,
      unidad:unidad_curricular!inner (
        nombre,
        materia:materia!inner ( nombre )
      )
    )
  `)
  .not('grade_score', 'is', null)
  .order('timestamp_resp', { ascending: true })
  .limit(2000);

if (error) {
  console.error('ERROR:', error);
  process.exit(1);
}

const rows = data.map((r) => ({
  id_respuesta: r.id_respuesta,
  materia: r.item?.unidad?.materia?.nombre ?? '?',
  unidad: r.item?.unidad?.nombre ?? '?',
  bloom: r.item?.nivel_bloom ?? '',
  codigo: r.usuario?.codigo_anonimo ?? '',
  grado: r.usuario?.grado ?? '',
  pregunta: r.item?.pregunta ?? '',
  respuesta_ref: r.item?.respuesta_ref ?? '',
  respuesta: r.respuesta_texto ?? '',
  punteo_sistema: r.grade_score == null ? null : Math.round(r.grade_score * 100),
  sst: r.sst == null ? null : Math.round(r.sst * 100),
  uso_pista: r.uso_pista,
  seg: r.tiempo_respuesta_ms == null ? null : Math.round(r.tiempo_respuesta_ms / 1000),
  fecha: r.timestamp_resp,
}));

const porMateria = {};
for (const r of rows) porMateria[r.materia] = (porMateria[r.materia] || 0) + 1;
console.log('TOTAL con grade_score:', rows.length);
console.log('Por materia:', porMateria);
console.log('Distribución punteo:', rows.reduce((a, r) => {
  const b = r.punteo_sistema >= 71 ? 'alto' : r.punteo_sistema >= 41 ? 'medio' : 'bajo';
  a[b] = (a[b] || 0) + 1; return a;
}, {}));

writeFileSync(`${ROOT}/tesis/concordancia/respuestas.json`, JSON.stringify(rows, null, 2));
console.log('OK → respuestas.json');
