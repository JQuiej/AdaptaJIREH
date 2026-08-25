import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'C:/Users/Quiej/Documents/Universidad 9no. semestre/Proyecto de Graduacion/Sistema AdaptaJIREH/tesis/concordancia';
const sel = JSON.parse(readFileSync(`${DIR}/muestra.json`, 'utf8'));

const esc = (s) => (s ?? '').replace(/\r/g, '').trim();
const csvq = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

// ── 1) Hojas ciegas para el docente ────────────────────────────────────────
function hoja(materia, archivo) {
  const items = sel.filter((r) => r.materia === materia);
  const L = [];
  L.push(`# Calificación docente de respuestas abiertas — ${materia}`);
  L.push('');
  L.push('**Proyecto:** AdaptaJIREH — Sistema de aprendizaje adaptativo con IA, Liceo JIREH  ');
  L.push('**Docente:** ______________________________  **Fecha:** ______________');
  L.push('');
  L.push('## Instrucciones');
  L.push('');
  L.push('1. Lea la pregunta, la respuesta esperada y la respuesta que escribió el estudiante.');
  L.push('2. Asigne un punteo de **0 a 100** según qué tan correcta es la respuesta del estudiante,');
  L.push('   usando su criterio habitual de aula. No hay respuestas parciales prohibidas: puede dar');
  L.push('   punteos intermedios (por ejemplo 60) si la respuesta es parcialmente correcta.');
  L.push('3. Califique **solo el contenido**; ignore la ortografía y la redacción.');
  L.push('4. Escriba el punteo en la casilla "Punteo del docente". Si desea, agregue una observación.');
  L.push('');
  L.push('> Las respuestas son reales, tomadas del uso del sistema en clase entre el 23 y el 28 de');
  L.push('> julio de 2026. Los estudiantes aparecen con código anónimo.');
  L.push('');
  L.push('---');
  L.push('');
  for (const r of items) {
    L.push(`## ${materia === 'Inglés' ? 'I' : 'M'}-${String(items.indexOf(r) + 1).padStart(2, '0')} · Unidad: ${esc(r.unidad)} · Estudiante: ${r.codigo} (${r.grado})`);
    L.push('');
    L.push(`**Pregunta:** ${esc(r.pregunta)}`);
    L.push('');
    L.push(`**Respuesta esperada (referencia del ítem):** ${esc(r.respuesta_ref)}`);
    L.push('');
    L.push('**Respuesta del estudiante:**');
    L.push('');
    L.push('> ' + esc(r.respuesta).replace(/\n/g, '\n> '));
    L.push('');
    L.push('| Punteo del docente (0–100) | Observación |');
    L.push('|---|---|');
    L.push('|  |  |');
    L.push('');
    L.push('---');
    L.push('');
  }
  writeFileSync(`${DIR}/${archivo}`, L.join('\n'), 'utf8');
}
hoja('Inglés', 'hoja_docente_ingles.md');
hoja('Matemáticas', 'hoja_docente_matematicas.md');

// ── 2) CSV ciego (por si prefieren llenarlo en Excel) ──────────────────────
const csvCiego = [
  ['n', 'materia', 'unidad', 'estudiante', 'pregunta', 'respuesta_esperada', 'respuesta_estudiante', 'punteo_docente', 'observacion'].join(','),
  ...sel.map((r) =>
    [r.n, csvq(r.materia), csvq(r.unidad), r.codigo, csvq(esc(r.pregunta)), csvq(esc(r.respuesta_ref)), csvq(esc(r.respuesta)), '', ''].join(',')
  ),
].join('\n');
writeFileSync(`${DIR}/hoja_docente.csv`, '\uFEFF' + csvCiego, 'utf8');

// ── 3) Clave con el punteo del sistema ─────────────────────────────────────
const csvClave = [
  ['n', 'materia', 'unidad', 'estudiante', 'bloom', 'pregunta', 'respuesta_esperada', 'respuesta_estudiante',
   'punteo_sistema', 'banda_sistema', 'sst_pct', 'uso_pista', 'segundos', 'fecha', 'id_respuesta',
   'punteo_docente', 'banda_docente', 'concuerda_banda', 'dif_abs', 'concuerda_10pts'].join(','),
  ...sel.map((r, i) => {
    const f = i + 2; // fila en la hoja de cálculo
    return [
      r.n, csvq(r.materia), csvq(r.unidad), r.codigo, r.bloom,
      csvq(esc(r.pregunta)), csvq(esc(r.respuesta_ref)), csvq(esc(r.respuesta)),
      r.punteo_sistema, r.banda, r.sst, r.uso_pista, r.seg,
      csvq(r.fecha.slice(0, 10)), r.id_respuesta,
      '', // punteo_docente ← se llena con lo que ponga el docente
      csvq(`=IF(P${f}="","",IF(P${f}>=71,"Alto",IF(P${f}>=41,"Medio","Bajo")))`),
      csvq(`=IF(P${f}="","",IF(J${f}=Q${f},1,0))`),
      csvq(`=IF(P${f}="","",ABS(I${f}-P${f}))`),
      csvq(`=IF(P${f}="","",IF(S${f}<=10,1,0))`),
    ].join(',');
  }),
].join('\n');
writeFileSync(`${DIR}/clave_sistema.csv`, '\uFEFF' + csvClave, 'utf8');

// ── 4) Resumen legible de la clave ─────────────────────────────────────────
const R = [];
R.push('# Clave — punteos asignados por el sistema (NO entregar al docente)');
R.push('');
R.push('Muestra de 30 respuestas abiertas reales evaluadas por el juez LLM del sistema');
R.push('(`grade_score`, migración 022), tomadas del uso en aula del 23 al 28 de julio de 2026.');
R.push('');
R.push('| N.º | Materia | Est. | Pregunta | Respuesta del estudiante | Punteo sistema | Banda |');
R.push('|---|---|---|---|---|---|---|');
for (const r of sel) {
  const corta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  R.push(`| ${r.n} | ${r.materia} | ${r.codigo} | ${corta(esc(r.pregunta).replace(/\|/g, '/'), 90)} | ${corta(esc(r.respuesta).replace(/\n/g, ' ').replace(/\|/g, '/'), 80)} | **${r.punteo_sistema}** | ${r.banda} |`);
}
R.push('');
R.push('## Distribución de la muestra');
R.push('');
const bandas = sel.reduce((a, r) => ((a[r.banda] = (a[r.banda] || 0) + 1), a), {});
R.push(`- Inglés: ${sel.filter((r) => r.materia === 'Inglés').length} · Matemáticas: ${sel.filter((r) => r.materia === 'Matemáticas').length}`);
R.push(`- Bandas del sistema — Alto (≥71): ${bandas.Alto || 0} · Medio (41–70): ${bandas.Medio || 0} · Bajo (<41): ${bandas.Bajo || 0}`);
R.push(`- Estudiantes distintos: ${new Set(sel.map((r) => r.codigo)).size} · Ítems distintos: ${new Set(sel.map((r) => r.pregunta)).size}`);
R.push(`- Punteo promedio del sistema: ${(sel.reduce((a, r) => a + r.punteo_sistema, 0) / sel.length).toFixed(1)}`);
writeFileSync(`${DIR}/clave_sistema.md`, R.join('\n'), 'utf8');

console.log('Generados en tesis/concordancia:');
console.log(' hoja_docente_ingles.md, hoja_docente_matematicas.md, hoja_docente.csv');
console.log(' clave_sistema.csv, clave_sistema.md, muestra.json');
