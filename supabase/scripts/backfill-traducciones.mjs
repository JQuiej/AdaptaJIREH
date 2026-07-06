/**
 * Backfill de traducciones al español para ítems YA EXISTENTES.
 * Traduce toda PREGUNTA y toda PISTA que ESTÉ EN INGLÉS y que aún no tenga su
 * traducción (`pregunta_es` / `pista_es`), sin importar la materia (usa la misma
 * heurística `pareceIngles` que el sistema).
 *
 * Ejecutar:  node supabase/scripts/backfill-traducciones.mjs
 *            (o:  npm run backfill:traducciones)
 *
 * Script autónomo: llama a Gemini directamente (no importa de lib/, que usa
 * sintaxis ESM compilada por Next y no corre con Node directo).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAMANO_LOTE = 20; // preguntas por llamada a Gemini

// ── Cargar variables desde .env.local (dotenv no está instalado) ──
function cargarEnv() {
  try {
    const texto = readFileSync(resolve(__dirname, '../../.env.local'), 'utf8');
    for (const linea of texto.split('\n')) {
      const t = linea.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx === -1) continue;
      const clave = t.slice(0, idx).trim();
      const valor = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {
    console.warn('No se pudo leer .env.local; se usarán las variables del entorno.');
  }
}

// Heurística de idioma — misma lógica que lib/idioma.js (duplicada a propósito,
// para que el script sea independiente del sistema de módulos de Next).
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

function pareceIngles(texto) {
  const original = (texto ?? '').toLowerCase();
  if (/[¿¡ñ]/.test(original)) return false;

  const limpio = original.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const palabras = limpio.match(/[a-z']+/g) ?? [];
  if (palabras.length === 0) return false;

  let en = 0, es = 0;
  for (const p of palabras) {
    if (PALABRAS_EN.has(p)) en += 1;
    if (PALABRAS_ES.has(p)) es += 1;
  }
  return en > es;
}

function normalizar(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

async function withRetry(fn, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const reintentable = /503|429|high demand|Service Unavailable|overloaded|rate|Too Many/i.test(err.message ?? '');
      if (reintentable && i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, Math.min(8000, 1500 * (i + 1))));
        continue;
      }
      throw err;
    }
  }
}

function getModel() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel(
    {
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    },
    { apiVersion: 'v1beta' }
  );
}

// Traduce un lote de preguntas; devuelve arreglo alineado (null = ya en español).
async function translateQuestions(questions) {
  const lista = Array.isArray(questions) ? questions : [];
  if (lista.length === 0) return [];

  const model = getModel();
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
    return lista.map(() => null);
  }

  return lista.map((original, i) => {
    const trad = traducciones[i];
    if (!trad || typeof trad !== 'string') return null;
    return normalizar(trad) === normalizar(original) ? null : trad.trim();
  });
}

async function main() {
  cargarEnv();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  }
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1) Ítems a los que les falta alguna traducción (pregunta_es o pista_es)
  const { data: items, error: itemErr } = await supabase
    .from('item')
    .select('id_item, pregunta, pregunta_es, pista, pista_es')
    .or('pregunta_es.is.null,pista_es.is.null');
  if (itemErr) throw itemErr;

  // 2) Armar la lista de textos EN INGLÉS pendientes (preguntas y pistas)
  const tareas = [];
  for (const it of items ?? []) {
    if (it.pregunta_es == null && pareceIngles(it.pregunta)) {
      tareas.push({ id: it.id_item, campo: 'pregunta_es', texto: it.pregunta });
    }
    if (it.pista && it.pista_es == null && pareceIngles(it.pista)) {
      tareas.push({ id: it.id_item, campo: 'pista_es', texto: it.pista });
    }
  }
  console.log(`Textos en inglés a traducir: ${tareas.length} (preguntas y pistas)`);
  if (tareas.length === 0) return;

  // 3) Traducir en lotes y actualizar el campo correspondiente
  let traducidos = 0;
  let saltados = 0;
  for (let i = 0; i < tareas.length; i += TAMANO_LOTE) {
    const lote = tareas.slice(i, i + TAMANO_LOTE);
    console.log(`Procesando ${i + 1}–${i + lote.length} de ${tareas.length}...`);

    const traducciones = await translateQuestions(lote.map((t) => t.texto));

    for (let j = 0; j < lote.length; j++) {
      const trad = traducciones[j];
      if (!trad) { saltados++; continue; } // ya estaba en español / sin cambio
      const { error: updErr } = await supabase
        .from('item')
        .update({ [lote[j].campo]: trad })
        .eq('id_item', lote[j].id);
      if (updErr) {
        console.error(`  Error al actualizar ${lote[j].id} (${lote[j].campo}): ${updErr.message}`);
      } else {
        traducidos++;
      }
    }
  }

  console.log(`\nListo. Traducidos: ${traducidos} · Sin cambio (ya en español): ${saltados}`);
}

main().catch((err) => {
  console.error('Falló el backfill:', err.message);
  process.exit(1);
});
