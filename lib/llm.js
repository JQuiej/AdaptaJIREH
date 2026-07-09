import { GoogleGenerativeAI } from '@google/generative-ai';
import { BLOOM_LABELS, BLOOM_LABELS_INGLES, NIVELES_BLOOM_VALORES } from '@/lib/bloom';

// Máximo de caracteres del material que se le pasa al modelo. gemini-2.5-flash-lite
// admite ~1M tokens, así que este límite solo evita prompts absurdamente grandes;
// es lo bastante amplio para no cortar las últimas secciones de un PDF típico.
export const MAX_CONTEXT_CHARS = 40000;

// Instrucción para bajar la dificultad de los ítems de matemáticas, ya que el
// nivel resultaba alto para los alumnos. Compartida por todos los flujos de
// generación/regeneración para mantener el mismo criterio.
const AJUSTE_MATEMATICAS =
  'AJUSTE DE DIFICULTAD (MATEMÁTICAS): baja NOTORIAMENTE la dificultad, un poco MÁS de lo habitual, ya que el nivel actual sigue resultando demasiado alto para los alumnos. ' +
  'Usa SIEMPRE números pequeños y "redondos" (de preferencia enteros de UNA sola cifra, y como máximo dos cifras), un ÚNICO paso o cálculo por pregunta (nunca problemas de varios pasos encadenados), ' +
  'enunciados muy cortos y directos, vocabulario sencillo y ejemplos cotidianos y concretos (dinero, objetos, edades, etc.). ' +
  'Evita fracciones, decimales, potencias, raíces o formulaciones abstractas salvo que el tema lo exija estrictamente. ' +
  'Mantén el nivel Bloom que corresponde a cada pregunta; solo hazlas claramente MÁS accesibles y fáciles de resolver, sin que lleguen a ser triviales ni de respuesta obvia. ' +
  'PISTA (feedback_hint): NO resuelvas la pregunta ni des el procedimiento paso a paso. La pista SOLO debe orientar: recordar el concepto, la fórmula o la operación que conviene usar, o qué observar. ' +
  'PROHIBIDO en la pista: sustituir los números del enunciado, indicar las operaciones concretas a realizar (p. ej. "suma 5 + 3"), dar resultados parciales o el resultado final. ' +
  'Ejemplo CORRECTO: "Recuerda que el perímetro es la suma de todos los lados." Ejemplo PROHIBIDO: "Suma 4 + 4 + 6 para obtener el perímetro."';

// Criterio compartido para que los ENUNCIADOS sean claros y autoexplicativos.
// Se usa en todos los flujos de generación/regeneración porque algunos ítems
// resultaban confusos: instrucciones ambiguas, referencias vagas o sin decir
// qué se espera exactamente en la respuesta. Además, refuerza en la propia
// pregunta el aviso que ve el alumno de EXPLICAR/JUSTIFICAR lo que responde.
const INSTRUCCIONES_CLARAS =
  'CLARIDAD DEL ENUNCIADO (obligatorio): redacta cada pregunta de forma clara, directa y autoexplicativa, de modo que el alumno entienda a la primera qué debe hacer. ' +
  'Empieza con una instrucción concreta (p. ej. "Explica...", "Describe...", "Compara...", "Resuelve y justifica..."). ' +
  'Evita ambigüedades, dobles negaciones y referencias vagas como "lo anterior", "esto" o "lo visto"; si necesitas mencionar algo, nómbralo explícitamente dentro de la pregunta. ' +
  'Usa vocabulario sencillo y una sola idea por pregunta; si pides varias cosas, enuméralas. ' +
  'El enunciado DEBE dejar claro qué se espera en la respuesta (qué explicar, cuántos ejemplos, etc.). ' +
  'JUSTIFICACIÓN (obligatorio): toda pregunta debe pedir EXPLÍCITAMENTE que el alumno EXPLIQUE o JUSTIFIQUE su respuesta (el porqué), no solo que dé el resultado. ' +
  'Termina el enunciado con una indicación clara como "Explica tu razonamiento." o "Justifica tu respuesta." (en preguntas de opción: "Elige la opción correcta y explica por qué la elegiste.").';

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

// Quita los cercos de código (```json ... ```) y espacios de la respuesta.
function limpiarJSON(raw) {
  return String(raw ?? '').replace(/```json|```/g, '').trim();
}

/**
 * Repara un JSON TRUNCADO (respuesta del modelo cortada por el límite de tokens):
 * cierra una cadena abierta y balancea los corchetes/llaves que quedaron sin
 * cerrar. No es un parser completo; solo intenta recuperar lo más posible de una
 * respuesta incompleta para no perder todo el contenido ya generado.
 */
function repararJSON(s) {
  let inStr = false, esc = false;
  const stack = [];
  let out = '';
  for (const ch of s) {
    out += ch;
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inStr) out += '"';           // cerrar cadena truncada
  out = out.replace(/[,\s]+$/, ''); // quitar coma/espacios colgantes
  // Si quedó una clave sin valor ("clave":  o  "clave), descartarla para cerrar.
  out = out.replace(/,?\s*"[^"]*"\s*:\s*$/, '');
  out = out.replace(/,\s*"[^"]*"$/, '');
  while (stack.length) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }
  return out;
}

/**
 * Parsea la respuesta JSON del modelo de forma tolerante: primero intenta un
 * parseo normal y, si falla (p. ej. la respuesta se truncó y quedó una cadena
 * sin cerrar), intenta repararla. Lanza si aun así no se puede parsear.
 */
function parseJSONSeguro(raw) {
  const limpio = limpiarJSON(raw);
  try {
    return JSON.parse(limpio);
  } catch {
    return JSON.parse(repararJSON(limpio)); // último intento: reparar truncado
  }
}

// Rescata objetos {"titulo":...,"contenido":...} completos de un texto JSON
// truncado, escaneando llaves balanceadas. Se usa como último recurso para la
// teoría cuando ni el parseo normal ni la reparación funcionan.
function rescatarSecciones(raw) {
  const s = limpiarJSON(raw);
  const secciones = [];
  const inicios = [];               // pila de posiciones de '{' abiertas
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') { inicios.push(i); }
    else if (ch === '}') {
      const ini = inicios.pop();
      if (ini == null) continue;
      try {
        const obj = JSON.parse(s.slice(ini, i + 1));
        if (obj && (obj.titulo || obj.contenido)) secciones.push(obj);
      } catch { /* objeto incompleto, se ignora */ }
    }
  }
  return secciones;
}

/**
 * Verifica que el contenido del PDF corresponda al tema seleccionado, para
 * evitar generar ítems a partir de un material que no tiene nada que ver (p. ej.
 * el docente sube por error el PDF equivocado). Es una llamada barata y rápida.
 *
 * Falla en modo "abierto": si la verificación no se puede completar (error del
 * modelo, formato inesperado), devuelve `relacionado: true` para NO bloquear un
 * material legítimo por un fallo del chequeo.
 *
 * @returns {Promise<{ relacionado: boolean, motivo: string }>}
 */
export async function checkTopicRelevance({ extractedText, subjectName, unitName }) {
  const model = getModel(0.1, 256);
  const prompt = `Eres docente de bachillerato en Guatemala. Debes decidir si el MATERIAL corresponde al tema indicado, para saber si sirve para generar preguntas de ese tema.
MATERIA: ${subjectName}
TEMA: ${unitName}
Criterio: responde "relacionado": false SOLO si el material claramente NO trata sobre este tema/materia (es de otra asignatura, otro asunto o contenido irrelevante). Si el material trata el tema, aunque sea parcialmente o con otro enfoque, responde true. Ante la duda, responde true.
MATERIAL (fragmento):
${extractedText.slice(0, 8000)}

Responde SOLO con este JSON:
{"relacionado":true,"motivo":"breve explicación en español"}`;

  try {
    const result = await withRetry(() => model.generateContent(prompt));
    const p = parseJSONSeguro(result.response.text());
    // Solo bloquea si el modelo dice explícitamente que NO está relacionado.
    const relacionado = p?.relacionado !== false;
    return { relacionado, motivo: String(p?.motivo ?? '').trim() };
  } catch {
    return { relacionado: true, motivo: '' }; // fail-open: no bloquear por fallo del chequeo
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
Reglas: respuesta_ref=2-3 oraciones, pista=orienta sin revelar. Todas las preguntas deben corresponder al nivel Bloom ${bloomLevel} indicado.
${INSTRUCCIONES_CLARAS}${exclusionBlock}
Material: ${extractedText.slice(0, MAX_CONTEXT_CHARS)}
JSON: {"items":[{"question":"","reference_answer":"","feedback_hint":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const parsed = parseJSONSeguro(result.response.text());
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
  esMatematicas = false,
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
- CLARIDAD: redacta enunciados claros, directos y autoexplicativos, que empiecen con una instrucción concreta (p. ej. "Escribe...", "Completa...", "Elige..."). Evita ambigüedades y referencias vagas como "lo anterior" o "esto"; nombra explícitamente lo que menciones. Que el alumno entienda a la primera qué debe responder.
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
Reglas: reference_answer = 2-3 oraciones; feedback_hint orienta sin revelar la respuesta.
${INSTRUCCIONES_CLARAS}${esMatematicas ? `\n${AJUSTE_MATEMATICAS}` : ''}${exclusionBlock}
Material: ${extractedText.slice(0, MAX_CONTEXT_CHARS)}
Responde SOLO con este JSON:
{"items":[{"bloom":1,"question":"","reference_answer":"","feedback_hint":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const parsed = parseJSONSeguro(result.response.text());
  if (!Array.isArray(parsed?.items)) throw new Error('Gemini devolvió formato inesperado');

  // Normaliza el nivel de cada ítem (1-4). Si el modelo omitió el nivel, se
  // reparte en orden por bloques de `porNivel`. Se descartan ítems incompletos
  // (sin pregunta o sin respuesta), p. ej. uno truncado al final de la respuesta.
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
  }).filter((it) => it.question.trim() && it.reference_answer.trim());
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
  esMatematicas = false,
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
  const matematicasTxt = esMatematicas ? `\n${AJUSTE_MATEMATICAS}` : '';
  const exclusion = excludeQuestions.length
    ? `\nNO repitas ni parafrasees estas preguntas que ya existen en el tema:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}`
    : '';
  const material = materialContext?.trim()
    ? `\nMATERIAL DE ESTUDIO DEL TEMA (basa la pregunta en esto):\n${materialContext.slice(0, MAX_CONTEXT_CHARS)}`
    : '';

  // En inglés la claridad y la justificación ya las cubre `idiomaTxt` (con su
  // regla propia para el nivel 3), por lo que no se repite aquí.
  const clarasTxt = esIngles ? '' : `\n${INSTRUCCIONES_CLARAS}`;

  const prompt = `Eres docente de bachillerato en Guatemala. Reescribe UNA pregunta de texto libre sobre: ${subjectName} - ${unitName}.
NIVEL BLOOM ${bloomLevel}: ${nivelTxt}. La nueva pregunta DEBE mantener EXACTAMENTE este mismo nivel Bloom.
${ajusteTxt}${instruccionTxt}${clarasTxt}${idiomaTxt}${matematicasTxt}
PREGUNTA ACTUAL (la que se va a reemplazar): ${currentQuestion}${exclusion}
Reglas: reference_answer = ${esIngles ? '1-2' : '2-3'} oraciones; feedback_hint orienta sin revelar la respuesta.${material}
Responde SOLO con este JSON:
{"question":"","reference_answer":"","feedback_hint":""}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const p = parseJSONSeguro(result.response.text());
  return {
    question:         p.question ?? '',
    reference_answer: p.reference_answer ?? '',
    feedback_hint:    p.feedback_hint ?? '',
  };
}

/**
 * Genera apuntes de estudio (teoría) a partir del PDF, para que el estudiante
 * APRENDA el tema sin preguntas. Devuelve secciones con título y explicación.
 *
 * Si se pasan las `preguntas` que va a responder el alumno, la teoría se genera
 * de modo que EXPLIQUE los conceptos necesarios para resolverlas (sin dar la
 * respuesta), para que no queden preguntas sobre temas que la teoría no cubre.
 *
 * @returns {{ resumen:string, secciones:Array<{titulo, contenido}> }}
 */
export async function generateTheory({ extractedText, subjectName, unitName, preguntas = [], esIngles = false }) {
  // 8192 tokens: los apuntes con ejemplos resueltos son largos; con 4096 la
  // respuesta se truncaba y el JSON quedaba inválido ("Unterminated string").
  const model = getModel(0.4, 8192);

  // Lista de preguntas (solo enunciados) para que la teoría cubra sus conceptos.
  const listaPreguntas = (preguntas ?? [])
    .map((p) => (typeof p === 'string' ? p : p?.question ?? p?.pregunta ?? ''))
    .map((q) => String(q).trim())
    .filter(Boolean);
  const bloquePreguntas = listaPreguntas.length
    ? `\nEl alumno deberá responder DESPUÉS estas preguntas; asegúrate de que los apuntes EXPLIQUEN con claridad los conceptos, definiciones y procedimientos necesarios para resolverlas (explica el "cómo" y el "por qué"), pero NO incluyas las respuestas ni te dirijas a las preguntas directamente:\n${listaPreguntas.map((q) => `- ${q}`).join('\n')}\n` +
      'COBERTURA COMPLETA (obligatorio): revisa cada pregunta e identifica TODO lo que el alumno necesita saber para responderla (conceptos, definiciones, fórmulas, condiciones, reglas y procedimientos previos). Los apuntes DEBEN cubrir ese contenido COMPLETO. ' +
      'Si algún concepto o requisito necesario NO aparece en el MATERIAL pero hace falta para resolver las preguntas (por ejemplo, en funciones la condición para que una relación sea función / su operacionalización), AÑÁDELO igualmente y explícalo con claridad, para que NO quede ningún tema de las preguntas sin cubrir en la teoría.\n'
    : '';
  const idiomaTxt = esIngles
    ? '\nESCRIBE los apuntes EN ESPAÑOL para que el alumno comprenda; las palabras o frases en inglés que deba aprender van entre comillas con su explicación en español.'
    : '';

  const prompt = `Eres docente de bachillerato en Guatemala. A partir del MATERIAL, redacta apuntes de estudio claros y didácticos para que un estudiante APRENDA el tema (NO generes preguntas).
Materia: ${subjectName} | Unidad: ${unitName}
Organiza el contenido en secciones; cada sección con un título corto y una explicación sencilla y COMPLETA, con ejemplos resueltos y contextualizados a Guatemala cuando ayuden. Usa lenguaje cercano y claro.${idiomaTxt}${bloquePreguntas}
MATERIAL:
${extractedText.slice(0, MAX_CONTEXT_CHARS)}

Responde SOLO con este JSON:
{"resumen":"1-2 oraciones que resumen el tema","secciones":[{"titulo":"","contenido":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const raw = result.response.text();

  let p;
  try {
    p = parseJSONSeguro(raw);
  } catch {
    // Ni el parseo normal ni la reparación funcionaron: rescatar las secciones
    // completas que sí se alcanzaron a generar antes del corte.
    const resumen = limpiarJSON(raw).match(/"resumen"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';
    p = { resumen: resumen.replace(/\\"/g, '"').replace(/\\n/g, '\n'), secciones: rescatarSecciones(raw) };
  }

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
  const model   = getModel(0.8, 8192);

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
  const raw = result.response.text();
  let secciones;
  try {
    secciones = parseJSONSeguro(raw)?.secciones;
  } catch {
    secciones = rescatarSecciones(raw); // rescatar lo generado antes del corte
  }
  return (Array.isArray(secciones) ? secciones : [])
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
  const p = parseJSONSeguro(result.response.text());
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
  const p = parseJSONSeguro(result.response.text());
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
    const p = parseJSONSeguro(result.response.text());
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
  const p = parseJSONSeguro(result.response.text());
  // Devuelve partes separadas para guardarlas individualmente en BD
  return {
    diagnostico: p.diagnosis   ?? p.diagnostico ?? '',
    explicacion: p.explanation ?? p.explicacion ?? '',
    ejemplo:     p.example     ?? p.ejemplo     ?? '',
    texto:       `${p.diagnosis ?? p.diagnostico} ${p.explanation ?? p.explicacion} ${p.example ?? p.ejemplo}`.trim(),
  };
}
