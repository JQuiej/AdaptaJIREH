import { GoogleGenerativeAI } from '@google/generative-ai';
import { BLOOM_LABELS, NIVELES_BLOOM_VALORES } from '@/lib/bloom';

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
}) {
  const porNivel = Math.max(1, parseInt(perLevel, 10) || 5);
  const total    = porNivel * NIVELES_BLOOM_VALORES.length;
  const model    = getModel(0.85, 8192);

  const nivelesTxt = NIVELES_BLOOM_VALORES
    .map((n) => `- Nivel ${n}: ${BLOOM_LABELS[n] ?? ''}`)
    .join('\n');

  const exclusionBlock = excludeQuestions.length
    ? `\nIMPORTANTE: NO repitas ni parafrasees estas preguntas que YA existen:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}\n`
    : '';

  const prompt = `Eres docente de bachillerato en Guatemala. Genera preguntas de texto libre sobre: ${subjectName} - ${unitName}.
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
