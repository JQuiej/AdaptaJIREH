import { GoogleGenerativeAI } from '@google/generative-ai';

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

function getEmbeddingModel() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // gemini-embedding-001 es el modelo de embeddings vigente de Gemini (text-embedding-004 fue retirado)
  return genAI.getGenerativeModel({ model: 'gemini-embedding-001' }, { apiVersion: 'v1beta' });
}

async function getEmbedding(text) {
  const model  = getEmbeddingModel();
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// Los embeddings de Gemini tienen un "piso" alto: textos no relacionados dan
// coseno ≈ 0.5 y respuestas correctas ≈ 0.9. Recalibramos ese rango útil
// [SST_PISO, 1] → [0, 1] para que el SST discrimine de verdad.
const SST_PISO  = 0.5;
const SST_RANGO = 0.45; // 0.5 + 0.45 = 0.95 ≈ tope práctico de una respuesta correcta

/** SST: similitud (calibrada 0-1) entre la respuesta del estudiante y la referencia. */
export async function computeSST(studentResponse, referenceEmbedding) {
  const studentEmb = await getEmbedding(studentResponse);
  const refEmb = typeof referenceEmbedding === 'string'
    ? JSON.parse(referenceEmbedding)
    : referenceEmbedding;
  const raw = cosineSimilarity(studentEmb, refEmb);
  const calibrado = Math.max(0, Math.min(1, (raw - SST_PISO) / SST_RANGO));
  return Math.round(calibrado * 1000) / 1000;
}

/** Calcula y serializa el embedding de la respuesta de referencia para cachear en BD. */
export async function computeReferenceEmbedding(referenceAnswer) {
  return JSON.stringify(await getEmbedding(referenceAnswer));
}

/** Clasifica el tipo de retroalimentación según SST. */
export function classifyFeedback(sst) {
  if (sst >= 0.71) return 'basic';
  if (sst >= 0.41) return 'explanatory';
  return 'generative';
}
