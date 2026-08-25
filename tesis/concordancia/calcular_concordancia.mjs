/**
 * Calcula el porcentaje de concordancia docente–sistema.
 *
 * Uso:
 *   node tesis/concordancia/calcular_concordancia.mjs punteos_docentes.csv
 *
 * El CSV de entrada debe tener, como mínimo, las columnas `n` y `punteo_docente`
 * (0–100). Lo más cómodo es llenar la columna `punteo_docente` de
 * `clave_sistema.csv` y guardarlo con otro nombre.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const archivo = process.argv[2];
if (!archivo) {
  console.error('Falta el CSV con los punteos del docente.');
  process.exit(1);
}

// Parser CSV mínimo con soporte de comillas.
function parseCSV(texto) {
  const filas = [];
  let campo = '', fila = [], enComillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter((f) => f.some((v) => v !== '')).map((f) => Object.fromEntries(cab.map((h, i) => [h.trim(), f[i] ?? ''])));
}

const banda = (p) => (p >= 71 ? 'Alto' : p >= 41 ? 'Medio' : 'Bajo');

const muestra = JSON.parse(readFileSync(resolve(DIR, 'muestra.json'), 'utf8'));
const docente = parseCSV(readFileSync(resolve(process.cwd(), archivo), 'utf8'));

const pares = [];
for (const fila of docente) {
  const n = Number(fila.n);
  const pd = fila.punteo_docente?.trim();
  if (!pd) continue;
  const ref = muestra.find((m) => m.n === n);
  if (!ref) { console.warn(`Aviso: n=${n} no está en la muestra, se ignora.`); continue; }
  pares.push({ n, materia: ref.materia, sistema: ref.punteo_sistema, docente: Number(pd) });
}

if (!pares.length) {
  console.error('El CSV no trae ningún punteo del docente lleno.');
  process.exit(1);
}

function resumen(titulo, xs) {
  if (!xs.length) return;
  const bandaOK = xs.filter((p) => banda(p.sistema) === banda(p.docente));
  const dif10 = xs.filter((p) => Math.abs(p.sistema - p.docente) <= 10);
  const difProm = xs.reduce((a, p) => a + Math.abs(p.sistema - p.docente), 0) / xs.length;
  const pct = (k) => ((k / xs.length) * 100).toFixed(1);
  console.log(`\n── ${titulo} (n = ${xs.length}) ──`);
  console.log(`  Concordancia por banda (Alto/Medio/Bajo): ${bandaOK.length}/${xs.length} = ${pct(bandaOK.length)} %`);
  console.log(`  Concordancia estricta (±10 puntos):       ${dif10.length}/${xs.length} = ${pct(dif10.length)} %`);
  console.log(`  Diferencia absoluta media:                ${difProm.toFixed(1)} puntos`);
}

resumen('TOTAL', pares);
resumen('Inglés', pares.filter((p) => p.materia === 'Inglés'));
resumen('Matemáticas', pares.filter((p) => p.materia === 'Matemáticas'));

const disc = pares.filter((p) => banda(p.sistema) !== banda(p.docente));
if (disc.length) {
  console.log('\n── Casos en desacuerdo de banda ──');
  console.table(disc.map((p) => ({ n: p.n, materia: p.materia, sistema: p.sistema, docente: p.docente, dif: Math.abs(p.sistema - p.docente) })));
}
