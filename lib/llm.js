import { GoogleGenerativeAI } from '@google/generative-ai';
import { BLOOM_LABELS, BLOOM_LABELS_INGLES, NIVELES_BLOOM_VALORES } from '@/lib/bloom';

// Máximo de caracteres del material que se le pasa al modelo. gemini-2.5-flash-lite
// admite ~1M tokens, así que este límite solo evita prompts absurdamente grandes;
// es lo bastante amplio para no cortar las últimas secciones de un PDF típico.
export const MAX_CONTEXT_CHARS = 40000;

function getModel(temperature, maxOutputTokens) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel(
    {
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
      generationConfig: { temperature, maxOutputTokens },
    },
    { apiVersion: 'v1beta' }
  );
}

async function withRetry(fn, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err.message ?? '';
      const reintentable =
        msg.includes('503') || msg.includes('high demand') ||
        msg.includes('Service Unavailable') || msg.includes('overloaded') ||
        msg.includes('429') || msg.includes('rate') || msg.includes('Too Many');
      if (reintentable && i < maxAttempts - 1) {
        // Backoff progresivo: da tiempo a que el modelo saturado se recupere
        // en vez de martillarlo con reintentos inmediatos (1.5s, 3s, 4.5s...).
        await new Promise((r) => setTimeout(r, Math.min(8000, 1500 * (i + 1))));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Genera ítems de evaluación a partir del texto de un PDF.
 * @returns {Array<{ question, reference_answer, feedback_hint }>}
 */
export async function generateItems({ extractedText, subjectName, unitName, bloomLevel, itemCount = 15, excludeQuestions = [] }) {
  const model = getModel(0.85, 8192);
  const exclusionBlock = excludeQuestions.length
    ? `\nIMPORTANTE: NO repitas ni generes variantes/parafraseos de estas preguntas que YA existen. Crea preguntas sobre OTROS aspectos del material:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}\n`
    : '';
  const prompt = `Eres docente de bachillerato en Guatemala. Genera ${itemCount} preguntas de texto libre (Bloom ${bloomLevel}: ${BLOOM_LABELS[bloomLevel] ?? ''}) sobre: ${subjectName} - ${unitName}.
Reglas: respuesta_ref=2-3 oraciones, pista=orienta sin revelar. Todas las preguntas deben corresponder al nivel Bloom ${bloomLevel} indicado.${exclusionBlock}
Material: ${extractedText.slice(0, MAX_CONTEXT_CHARS)}
JSON: {"items":[{"question":"","reference_answer":"","feedback_hint":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const parsed = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  if (!Array.isArray(parsed?.items)) throw new Error('Gemini devolvió formato inesperado');
  return parsed.items;
}

/**
 * Genera ítems distribuidos en los 4 niveles de Bloom en UNA sola llamada a
 * Gemini: `perLevel` preguntas por cada nivel, cada ítem etiquetado con su
 * `bloom`. Una sola llamada (en vez de una por nivel) evita saturar Gemini y
 * la cascada de errores 503.
 *
 * @returns {Array<{ question, reference_answer, feedback_hint, bloom }>}
 */
export async function generateItemsByLevel({
  extractedText,
  subjectName,
  unitName,
  perLevel = 5,
  excludeQuestions = [],
  esIngles = false,
}) {
  const porNivel = Math.max(1, parseInt(perLevel, 10) || 5);
  const total    = porNivel * NIVELES_BLOOM_VALORES.length;
  const model    = getModel(0.85, 8192);

  // En inglés se usa la guía Bloom simplificada (niveles 2+ más fáciles) para no
  // fatigar a alumnos que aún no manejan bien el idioma.
  const etiquetas = esIngles ? BLOOM_LABELS_INGLES : BLOOM_LABELS;
  const nivelesTxt = NIVELES_BLOOM_VALORES
    .map((n) => `- Nivel ${n}: ${etiquetas[n] ?? ''}`)
    .join('\n');

  const exclusionBlock = excludeQuestions.length
    ? `\nIMPORTANTE: NO repitas ni parafrasees estas preguntas que YA existen:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}\n`
    : '';

  // Para inglés: enunciado, respuesta de referencia y pista TODO en español, y
  // niveles 2-4 sencillos y cortos (baja carga cognitiva).
  const prompt = esIngles
    ? `Eres docente de INGLÉS de bachillerato en Guatemala. Tus estudiantes están aprendiendo inglés y su nivel es básico, así que las preguntas deben ser CORTAS y claras, pero que los hagan pensar (no triviales ni con respuesta obvia).
Genera preguntas de texto libre sobre: ${subjectName} - ${unitName}.
Genera EXACTAMENTE ${porNivel} preguntas para CADA uno de estos 4 niveles (en total ${total} preguntas):
${nivelesTxt}
REGLAS OBLIGATORIAS:
- Escribe TODO en ESPAÑOL: el enunciado (question), la respuesta de referencia (reference_answer) y la pista (feedback_hint) van en español. SOLO las palabras o frases en inglés que el alumno debe aprender pueden ir en inglés, entre comillas.
- NO reveles la respuesta en el enunciado: la pregunta NUNCA debe contener la respuesta correcta ni pistas que la delaten dentro del texto. Toda ayuda va ÚNICAMENTE en "feedback_hint". (Ejemplo PROHIBIDO: "We are happy. ___ are happy." porque el enunciado ya muestra la respuesta.)
- Mantén las preguntas cortas y con vocabulario básico, pero un poco retadoras.
- Para preguntas de OPCIÓN (elegir entre varias): en el campo "question" escribe primero el enunciado y luego CADA opción en su propia línea, separadas con saltos de línea "\\n". Formato: "Enunciado de la pregunta\\na) opción 1\\nb) opción 2\\nc) opción 3".
- En el NIVEL 3 el enunciado SIEMPRE debe terminar pidiendo EXPLÍCITAMENTE que el alumno explique/justifique su elección. No basta con "¿cuál es la correcta?"; agrega una instrucción clara como "Elige la opción correcta y explica por qué la elegiste." (después de las opciones).
- reference_answer = 1-2 oraciones simples; feedback_hint orienta sin revelar la respuesta.
- Cada pregunta debe llevar en el campo "bloom" el número (1 a 4) del nivel al que corresponde.${exclusionBlock}
Material: ${extractedText.slice(0, MAX_CONTEXT_CHARS)}
Responde SOLO con este JSON:
{"items":[{"bloom":1,"question":"","reference_answer":"","feedback_hint":""}]}`
    : `Eres docente de bachillerato en Guatemala. Genera preguntas de texto libre sobre: ${subjectName} - ${unitName}.
Genera EXACTAMENTE ${porNivel} preguntas para CADA uno de estos 4 niveles de Bloom (en total ${total} preguntas):
${nivelesTxt}
Cada pregunta debe llevar en el campo "bloom" el número (1 a 4) del nivel al que corresponde.
Reglas: reference_answer = 2-3 oraciones; feedback_hint orienta sin revelar la respuesta.${exclusionBlock}
Material: ${extractedText.slice(0, MAX_CONTEXT_CHARS)}
Responde SOLO con este JSON:
{"items":[{"bloom":1,"question":"","reference_answer":"","feedback_hint":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const parsed = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  if (!Array.isArray(parsed?.items)) throw new Error('Gemini devolvió formato inesperado');

  // Normaliza el nivel de cada ítem (1-4). Si el modelo omitió el nivel, se
  // reparte en orden por bloques de `porNivel`.
  return parsed.items.map((it, i) => {
    let b = parseInt(it?.bloom, 10);
    if (!Number.isFinite(b) || b < 1 || b > 4) {
      b = NIVELES_BLOOM_VALORES[Math.floor(i / porNivel) % NIVELES_BLOOM_VALORES.length] ?? 1;
    }
    return {
      question:         it?.question ?? '',
      reference_answer: it?.reference_answer ?? '',
      feedback_hint:    it?.feedback_hint ?? '',
      bloom:            b,
    };
  });
}

/**
 * Regenera UN solo ítem manteniendo su nivel Bloom pero cambiando su
 * contenido (pregunta, respuesta de referencia y pista). Recibe el material de
 * estudio del tema como contexto y un ajuste de dificultad pedido por el
 * docente ('facil' | 'dificil' | 'similar') más una indicación libre opcional.
 *
 * @returns {{ question, reference_answer, feedback_hint }}
 */
export async function regenerateItem({
  subjectName,
  unitName,
  bloomLevel,
  materialContext = '',
  currentQuestion = '',
  ajuste = 'similar',
  instruccion = '',
  esIngles = false,
  excludeQuestions = [],
}) {
  const model = getModel(0.9, 1024);

  // En inglés se usa la guía Bloom simplificada para que la nueva pregunta
  // conserve el nivel pero siga siendo sencilla.
  const etiquetas = esIngles ? BLOOM_LABELS_INGLES : BLOOM_LABELS;
  const nivelTxt  = etiquetas[bloomLevel] ?? BLOOM_LABELS[bloomLevel] ?? '';

  const ajusteTxt = {
    facil:   'La pregunta anterior resultó DEMASIADO DIFÍCIL: haz la nueva claramente MÁS FÁCIL y sencilla (vocabulario básico, enunciado corto, una sola idea), pero SIN bajar de nivel Bloom.',
    dificil: 'La pregunta anterior resultó demasiado fácil: haz la nueva un poco MÁS EXIGENTE y retadora, pero SIN subir de nivel Bloom.',
    similar: 'Genera una pregunta DIFERENTE sobre el mismo tema, con una dificultad parecida a la anterior.',
  }[ajuste] ?? 'Genera una pregunta diferente sobre el mismo tema y nivel.';

  const instruccionTxt = instruccion?.trim()
    ? `\nINDICACIÓN DEL DOCENTE (respétala): ${instruccion.trim()}`
    : '';
  const idiomaTxt = esIngles
    ? '\nESCRIBE TODO EN ESPAÑOL (enunciado, respuesta de referencia y pista). SOLO las palabras o frases en inglés que el alumno debe aprender pueden ir en inglés, entre comillas.' +
      '\nNO reveles la respuesta en el enunciado ni pongas pistas dentro de la pregunta; toda ayuda va solo en "feedback_hint". Si es pregunta de opción, escribe cada opción en su propia línea con saltos de línea "\\n": "Enunciado\\na) opción 1\\nb) opción 2\\nc) opción 3".' +
      (Number(bloomLevel) === 3
        ? '\nEn este NIVEL 3 el enunciado SIEMPRE debe terminar pidiendo EXPLÍCITAMENTE que el alumno explique/justifique su elección (ej.: "Elige la opción correcta y explica por qué la elegiste."). No basta con preguntar cuál es la correcta.'
        : '')
    : '';
  const exclusion = excludeQuestions.length
    ? `\nNO repitas ni parafrasees estas preguntas que ya existen en el tema:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}`
    : '';
  const material = materialContext?.trim()
    ? `\nMATERIAL DE ESTUDIO DEL TEMA (basa la pregunta en esto):\n${materialContext.slice(0, MAX_CONTEXT_CHARS)}`
    : '';

  const prompt = `Eres docente de bachillerato en Guatemala. Reescribe UNA pregunta de texto libre sobre: ${subjectName} - ${unitName}.
NIVEL BLOOM ${bloomLevel}: ${nivelTxt}. La nueva pregunta DEBE mantener EXACTAMENTE este mismo nivel Bloom.
${ajusteTxt}${instruccionTxt}${idiomaTxt}
PREGUNTA ACTUAL (la que se va a reemplazar): ${currentQuestion}${exclusion}
Reglas: reference_answer = ${esIngles ? '1-2' : '2-3'} oraciones; feedback_hint orienta sin revelar la respuesta.${material}
Responde SOLO con este JSON:
{"question":"","reference_answer":"","feedback_hint":""}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  return {
    question:         p.question ?? '',
    reference_answer: p.reference_answer ?? '',
    feedback_hint:    p.feedback_hint ?? '',
  };
}

/**
 * Genera apuntes de estudio (teoría) a partir del PDF, para que el estudiante
 * APRENDA el tema sin preguntas. Devuelve secciones con título y explicación.
 * @returns {{ resumen:string, secciones:Array<{titulo, contenido}> }}
 */
export async function generateTheory({ extractedText, subjectName, unitName }) {
  const model = getModel(0.4, 4096);
  const prompt = `Eres docente de bachillerato en Guatemala. A partir del MATERIAL, redacta apuntes de estudio claros y didácticos para que un estudiante APRENDA el tema (NO generes preguntas).
Materia: ${subjectName} | Unidad: ${unitName}
Organiza el contenido en secciones; cada sección con un título corto y una explicación sencilla, con ejemplos contextualizados a Guatemala cuando ayuden. Usa lenguaje cercano y claro.

MATERIAL:
${extractedText.slice(0, MAX_CONTEXT_CHARS)}

Responde SOLO con este JSON:
{"resumen":"1-2 oraciones que resumen el tema","secciones":[{"titulo":"","contenido":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  return {
    resumen:   p.resumen ?? '',
    secciones: Array.isArray(p.secciones) ? p.secciones : [],
  };
}

/**
 * Genera SECCIONES ADICIONALES de teoría para un tema, DISTINTAS de las que ya
 * existen (para que el docente amplíe el material sin repetir lo escrito). Usa
 * como contexto el resumen y las secciones actuales, y evita parecerse a ellas.
 *
 * @returns {Array<{ titulo, contenido }>}
 */
export async function generateMoreTheorySections({
  subjectName,
  unitName,
  resumen = '',
  existingSections = [],
  count = 2,
  esIngles = false,
}) {
  const cuantas = Math.max(1, Math.min(6, parseInt(count, 10) || 2));
  const model   = getModel(0.8, 4096);

  const existentesTxt = existingSections.length
    ? existingSections
        .map((s, i) => `${i + 1}. ${s?.titulo ?? ''}${s?.contenido ? ` — ${String(s.contenido).slice(0, 300)}` : ''}`)
        .join('\n')
    : '(el tema aún no tiene secciones)';

  const idiomaTxt = esIngles
    ? '\nESCRIBE TODO EN ESPAÑOL. SOLO las palabras o frases en inglés que el alumno debe aprender pueden ir en inglés, entre comillas.'
    : '';

  const prompt = `Eres docente de bachillerato en Guatemala. Amplía los apuntes de estudio del tema: ${subjectName} - ${unitName}.
${resumen ? `RESUMEN DEL TEMA: ${resumen}\n` : ''}SECCIONES QUE YA EXISTEN (NO las repitas ni las parafrasees; cubre aspectos DISTINTOS del tema):
${existentesTxt}

Genera EXACTAMENTE ${cuantas} secciones NUEVAS y distintas, que complementen las anteriores sin solaparse. Cada sección con un título corto y una explicación sencilla y didáctica, con ejemplos contextualizados a Guatemala cuando ayuden. Usa lenguaje cercano y claro.${idiomaTxt}

Responde SOLO con este JSON:
{"secciones":[{"titulo":"","contenido":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  const secciones = Array.isArray(p?.secciones) ? p.secciones : [];
  return secciones
    .map((s) => ({ titulo: s?.titulo ?? '', contenido: s?.contenido ?? '' }))
    .filter((s) => s.titulo || s.contenido);
}

/**
 * Genera UN dato curioso breve y motivador sobre uno de los temas que el
 * estudiante está estudiando (activos y asignados), para mostrárselo al entrar
 * a la app. Se apoya en el resumen de la teoría de cada tema para no inventar.
 *
 * @param {{ temas: Array<{ materia, tema, resumen }> }}
 * @returns {{ texto:string, tema:string } | null}
 */
export async function generateDailyFact({ temas = [] }) {
  if (!Array.isArray(temas) || temas.length === 0) return null;

  const model = getModel(0.9, 512);
  const lista = temas
    .map((t, i) => `${i + 1}. ${t.materia ?? 'Materia'} — ${t.tema ?? 'Tema'}${t.resumen ? `: ${String(t.resumen).slice(0, 300)}` : ''}`)
    .join('\n');

  const prompt = `Eres un tutor cercano y motivador de bachillerato en Guatemala. A partir de los TEMAS que el estudiante está estudiando ahora, genera UN dato curioso breve y sorprendente para engancharlo al entrar a la app.
Reglas:
- Elige UNO de los temas de la lista.
- El dato debe ser CIERTO, interesante y fácil de entender, en español (1-2 oraciones).
- Tono cercano y motivador; contextualiza a Guatemala si ayuda.
- NO inventes datos falsos ni cifras dudosas; si no estás seguro, usa algo general pero verdadero del tema.

TEMAS:
${lista}

Responde SOLO con este JSON:
{"tema":"nombre del tema elegido","texto":"el dato curioso"}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  const texto = (p?.texto ?? '').trim();
  if (!texto) return null;
  return { texto, tema: (p?.tema ?? '').trim() };
}

/**
 * Juez LLM: evalúa la CORRECCIÓN de contenido (no solo similitud léxica) y
 * genera retroalimentación en una sola llamada. Penaliza definiciones invertidas,
 * negaciones y conceptos intercambiados que el SST por embeddings no detecta.
 * @returns {{ score:number, diagnostico, explicacion, ejemplo, texto }}
 */
export async function gradeAnswer({ question, referenceAnswer, studentResponse, bloomLevel }) {
  const model = getModel(0.2, 1024);
  const prompt = `Eres un tutor cercano de bachillerato en Guatemala. Compara la RESPUESTA del estudiante con la REFERENCIA correcta y juzga la CORRECCIÓN DEL CONTENIDO, no el parecido de palabras.
REGLAS DE JUICIO:
- Penaliza fuerte definiciones invertidas, negaciones o conceptos intercambiados (score bajo aunque use las mismas palabras).
- score = qué tan correcta es la respuesta de 0.0 (incorrecta) a 1.0 (totalmente correcta).
TONO DE LA RETROALIMENTACIÓN:
- Háblale DIRECTAMENTE al estudiante de "tú" (segunda persona). NUNCA digas "la respuesta", "el estudiante" ni hables en tercera persona.
- diagnosis: dile en qué te enfocaste bien o dónde está tu confusión (ej. "Confundiste cuál es...").
- explanation: dile tu punto de mejora concreto, qué debes corregir o reforzar (ej. "Recuerda que...").
- example: dale un ejemplo claro que te ayude a entenderlo.

PREGUNTA: ${question}
REFERENCIA (correcta): ${referenceAnswer}
RESPUESTA DEL ESTUDIANTE: ${studentResponse}
NIVEL BLOOM: ${bloomLevel} — ${BLOOM_LABELS[bloomLevel] ?? ''}

Responde SOLO con este JSON:
{"score":0.0,"diagnosis":"...","explanation":"...","example":"..."}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  const score = Math.max(0, Math.min(1, Number(p.score)));
  return {
    score: Number.isFinite(score) ? score : 0,
    diagnostico: p.diagnosis   ?? '',
    explicacion: p.explanation ?? '',
    ejemplo:     p.example     ?? '',
    texto:       `${p.diagnosis ?? ''} ${p.explanation ?? ''} ${p.example ?? ''}`.trim(),
  };
}

// Normaliza para comparar si una traducción es esencialmente igual al original
// (ítem ya en español): minúsculas, sin acentos, sin signos ni espacios extra.
function normalizar(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Traduce al español un lote de preguntas en una sola llamada (para no gastar
 * tokens al vuelo). Devuelve un arreglo del MISMO largo y orden que la entrada;
 * cada posición es la traducción, o `null` si la pregunta ya estaba en español
 * (no necesita traducción y no se mostrará botón al alumno).
 * @param {string[]} questions
 * @returns {Promise<Array<string|null>>}
 */
export async function translateQuestions(questions) {
  const lista = Array.isArray(questions) ? questions : [];
  if (lista.length === 0) return [];

  const model = getModel(0.1, 4096);
  const numeradas = lista.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const prompt = `Traduce al español, de forma natural y clara, cada una de las siguientes preguntas (para un estudiante de bachillerato en Guatemala).
Reglas:
- Conserva el significado y el formato (números, signos).
- Si una pregunta YA está en español, devuélvela tal cual.
- Devuelve EXACTAMENTE ${lista.length} traducciones, en el mismo orden.

PREGUNTAS:
${numeradas}

Responde SOLO con este JSON:
{"traducciones":["...","..."]}`;

  let traducciones = [];
  try {
    const result = await withRetry(() => model.generateContent(prompt));
    const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
    traducciones = Array.isArray(p?.traducciones) ? p.traducciones : [];
  } catch {
    // Si la traducción falla, no bloquea el guardado: todo queda sin traducción.
    return lista.map(() => null);
  }

  // Alinear por índice y descartar las que son iguales al original (español).
  return lista.map((original, i) => {
    const trad = traducciones[i];
    if (!trad || typeof trad !== 'string') return null;
    return normalizar(trad) === normalizar(original) ? null : trad.trim();
  });
}

/**
 * Genera retroalimentación personalizada cuando SST < 0.41.
 * @returns {string}
 */
export async function generateFeedback({ question, referenceAnswer, feedbackHint, studentResponse, bloomLevel }) {
  const model = getModel(0.5, 1024);
  const prompt = `
Eres un tutor paciente para bachillerato guatemalteco.
Genera retroalimentación constructiva en español, tono amable.

PREGUNTA: ${question}
RESPUESTA CORRECTA: ${referenceAnswer}
PISTA: ${feedbackHint}
RESPUESTA DEL ESTUDIANTE: ${studentResponse}
NIVEL BLOOM: ${bloomLevel} — ${BLOOM_LABELS[bloomLevel] ?? ''}

Responde SOLO con este JSON:
{"diagnosis":"...","explanation":"...","example":"..."}`.trim();

  const result = await withRetry(() => model.generateContent(prompt));
  const p = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  // Devuelve partes separadas para guardarlas individualmente en BD
  return {
    diagnostico: p.diagnosis   ?? p.diagnostico ?? '',
    explicacion: p.explanation ?? p.explicacion ?? '',
    ejemplo:     p.example     ?? p.ejemplo     ?? '',
    texto:       `${p.diagnosis ?? p.diagnostico} ${p.explanation ?? p.explicacion} ${p.example ?? p.ejemplo}`.trim(),
  };
}
