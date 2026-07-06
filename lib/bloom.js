// ============================================================
// Fuente única de los niveles de Bloom del sistema.
//
// Esquema de la tesis (coincide con la variable TR y con el material de estudio,
// que marca las secciones como «Recordar/Comprender», «Aplicar/Analizar» y
// «Evaluar/Crear»):
//   1 = Recordar / Comprender
//   2 = Aplicar / Analizar
//   3 = Evaluar
//   4 = Crear
//
// TR (transferencia) solo aplica en Bloom 3 (cercana) y 4 (lejana).
//
// ⚠ No dupliques estas etiquetas en otros archivos: importa desde aquí.
// ============================================================

export const NIVELES_BLOOM = [
  {
    valor: 1,
    clase: 'bloom-1',
    corto: 'Recordar / Comprender',
    etiqueta: 'Nivel 1 — Recordar y Comprender',
    // Guía que se le da al modelo al generar ítems de este nivel.
    llm: 'Recordar y Comprender — definir, identificar, explicar con tus propias palabras',
    descripcion:
      'Recordar hechos y conceptos y explicarlos con palabras propias: definir, identificar, resumir o dar ejemplos.',
  },
  {
    valor: 2,
    clase: 'bloom-2',
    corto: 'Aplicar / Analizar',
    etiqueta: 'Nivel 2 — Aplicar y Analizar',
    llm: 'Aplicar y Analizar — resolver problemas, comparar, descomponer un procedimiento',
    descripcion:
      'Usar lo aprendido en situaciones nuevas y descomponer la información: resolver ejercicios, comparar y relacionar causas con efectos.',
  },
  {
    valor: 3,
    clase: 'bloom-3',
    corto: 'Evaluar',
    etiqueta: 'Nivel 3 — Evaluar',
    llm: 'Evaluar — juicio crítico, argumentación, justificar la elección del mejor método',
    descripcion:
      'Emitir juicios fundamentados: argumentar, justificar la elección de un método o detectar y explicar errores en un procedimiento.',
  },
  {
    valor: 4,
    clase: 'bloom-4',
    corto: 'Crear',
    etiqueta: 'Nivel 4 — Crear',
    llm: 'Crear — diseño, propuesta, síntesis, modelar una situación nueva de la vida real',
    descripcion:
      'Producir algo nuevo: modelar matemáticamente un problema real, diseñar una solución o proponer y sintetizar.',
  },
];

/** Lista de los valores numéricos de Bloom en orden: [1, 2, 3, 4]. */
export const NIVELES_BLOOM_VALORES = NIVELES_BLOOM.map((n) => n.valor);

/** Mapa { nivel: guía para el LLM } — usado por lib/llm.js. */
export const BLOOM_LABELS = Object.fromEntries(
  NIVELES_BLOOM.map((n) => [n.valor, n.llm])
);

/** Devuelve la definición de un nivel Bloom, o null si no existe. */
export function bloomInfo(nivel) {
  return NIVELES_BLOOM.find((n) => n.valor === Number(nivel)) ?? null;
}
