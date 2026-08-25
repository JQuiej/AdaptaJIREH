import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DIR_IN = 'C:/Users/Quiej/Documents/Universidad 9no. semestre/Proyecto de Graduacion/Sistema AdaptaJIREH/tesis/concordancia';
const rows = JSON.parse(readFileSync(`${DIR_IN}/respuestas.json`, 'utf8'));

// PRNG determinista (para que la muestra sea reproducible y auditable)
let seed = 20260730;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shuffle = (a) => a.map((v) => [rnd(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);

const banda = (p) => (p >= 71 ? 'Alto' : p >= 41 ? 'Medio' : 'Bajo');

function muestrear(materia, n) {
  const pool = rows.filter((r) => r.materia === materia && r.respuesta.trim().length > 0);
  // proporción real de bandas en esa materia
  const cuenta = { Alto: 0, Medio: 0, Bajo: 0 };
  for (const r of pool) cuenta[banda(r.punteo_sistema)]++;
  const total = pool.length;
  const cupo = {
    Alto: Math.round((cuenta.Alto / total) * n),
    Medio: Math.round((cuenta.Medio / total) * n),
  };
  cupo.Bajo = n - cupo.Alto - cupo.Medio;

  const usados = { item: new Set(), texto: new Set(), estudiante: new Map() };
  const out = [];
  for (const b of ['Alto', 'Medio', 'Bajo']) {
    const cand = shuffle(pool.filter((r) => banda(r.punteo_sistema) === b));
    let tomados = 0;
    for (const r of cand) {
      if (tomados >= cupo[b]) break;
      const t = r.respuesta.trim().toLowerCase();
      if (usados.item.has(r.pregunta) || usados.texto.has(t)) continue;
      if ((usados.estudiante.get(r.codigo) || 0) >= 2) continue; // máx. 2 por estudiante
      usados.item.add(r.pregunta);
      usados.texto.add(t);
      usados.estudiante.set(r.codigo, (usados.estudiante.get(r.codigo) || 0) + 1);
      out.push(r);
      tomados++;
    }
  }
  return out;
}

const ing = muestrear('Inglés', 15);
const mat = muestrear('Matemáticas', 15);
const sel = [...ing, ...mat].map((r, i) => ({ n: i + 1, banda: banda(r.punteo_sistema), ...r }));

const DIR = 'C:/Users/Quiej/Documents/Universidad 9no. semestre/Proyecto de Graduacion/Sistema AdaptaJIREH/tesis/concordancia';
mkdirSync(DIR, { recursive: true });
writeFileSync(`${DIR}/muestra.json`, JSON.stringify(sel, null, 2));

console.log('Inglés:', ing.length, 'Matemáticas:', mat.length);
console.log('Bandas:', sel.reduce((a, r) => ((a[r.banda] = (a[r.banda] || 0) + 1), a), {}));
console.table(sel.map((r) => ({ n: r.n, materia: r.materia, cod: r.codigo, pts: r.punteo_sistema, resp: r.respuesta.slice(0, 45) })));
