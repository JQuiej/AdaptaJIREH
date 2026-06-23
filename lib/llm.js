import { GoogleGenerativeAI } from '@google/generative-ai';

const BLOOM_LABELS = {
  1: 'Recordar y Comprender — definición, identificación, explicación básica',
  2: 'Aplicar y Analizar — resolución de problemas, comparación',
  3: 'Evaluar — juicio crítico, argumentación',
  4: 'Crear — diseño, propuesta, síntesis',
};

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

async function withRetry(fn, maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const is503 = err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('Service Unavailable') || err.message?.includes('overloaded');
      if (is503 && i < maxAttempts - 1) {
        // flash-lite se recupera en ~1-2s; reintentos rápidos en vez de esperas largas
        await new Promise(r => setTimeout(r, 2000));
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
Reglas: respuesta_ref=2-3 oraciones, pista=orienta sin revelar.${exclusionBlock}
Material: ${extractedText.slice(0, 15000)}
JSON: {"items":[{"question":"","reference_answer":"","feedback_hint":""}]}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const parsed = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  if (!Array.isArray(parsed?.items)) throw new Error('Gemini devolvió formato inesperado');
  return parsed.items;
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
${extractedText.slice(0, 15000)}

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
