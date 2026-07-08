// Determina si una materia es de inglés (única materia donde se ofrece la
// traducción al español de los ítems, según el nivel de los alumnos).
// Compara el nombre normalizado (sin acentos ni mayúsculas).
export function esMateriaIngles(nombre) {
  const n = (nombre ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n.includes('ingl') || n.includes('english');
}

// Determina si una materia es de matemáticas. Se usa para ajustar (bajar un
// poco) la dificultad de los ítems generados, ya que el nivel resultaba alto
// para los alumnos. Compara el nombre normalizado (sin acentos ni mayúsculas).
export function esMateriaMatematicas(nombre) {
  const n = (nombre ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n.includes('matemat') || n.includes('math') || n.includes('aritmet')
    || n.includes('algebra') || n.includes('geometr') || n.includes('calculo');
}

// Palabras muy frecuentes propias de cada idioma. Se usan como señales para
// distinguir una pregunta en inglés de una en español.
const PALABRAS_EN = new Set([
  'the', 'what', 'which', 'how', 'why', 'who', 'where', 'when', 'is', 'are',
  'was', 'were', 'do', 'does', 'did', 'explain', 'describe', 'write', 'choose',
  'of', 'and', 'or', 'to', 'in', 'on', 'with', 'your', 'you', 'a', 'an',
  'sentence', 'word', 'verb', 'noun', 'tense', 'correct',
]);
const PALABRAS_ES = new Set([
  'que', 'cual', 'como', 'por', 'para', 'quien', 'donde', 'cuando', 'es',
  'son', 'una', 'uno', 'unos', 'unas', 'del', 'los', 'las', 'con', 'explica',
  'describe', 'escribe', 'cuales', 'porque', 'segun', 'siguiente', 'oracion',
]);

/**
 * Heurística ligera para decidir si un texto (una pregunta) está en inglés.
 * Se usa para traducir SOLO las preguntas en inglés (no las que ya están en
 * español). No pretende ser perfecta: la traducción real, de todos modos,
 * devuelve null si el texto ya estaba en español.
 */
export function pareceIngles(texto) {
  const limpio = (texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quitar acentos

  // Señales fuertes de español: signos ¿ ¡ o la letra ñ.
  if (/[¿¡ñ]/.test((texto ?? '').toLowerCase())) return false;

  const palabras = limpio.match(/[a-z']+/g) ?? [];
  if (palabras.length === 0) return false;

  let en = 0, es = 0;
  for (const p of palabras) {
    if (PALABRAS_EN.has(p)) en += 1;
    if (PALABRAS_ES.has(p)) es += 1;
  }
  return en > es;
}
