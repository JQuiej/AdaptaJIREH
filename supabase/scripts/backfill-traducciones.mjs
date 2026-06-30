/**
 * Backfill de traducciones al español para ítems YA EXISTENTES.
 * EXCLUSIVO de la materia de inglés: solo traduce ítems cuya materia es inglés
 * y que aún no tienen `pregunta_es`.
 *
 * Requisitos: haber ejecutado la migración 004_traduccion.sql.
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

// Mismas reglas que lib/idioma.js y lib/llm.js (duplicadas aquí a propósito,
// para que el script sea independiente del sistema de módulos de Next).
function esMateriaIngles(nombre) {
  const n = (nombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n.includes('ingl') || n.includes('english');
}

function normalizar(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

async function withRetry(fn, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const is503 = /503|high demand|Service Unavailable|overloaded/i.test(err.message ?? '');
      if (is503 && i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 2000));
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

  // 1) Materias de inglés
  const { data: materias, error: matErr } = await supabase
    .from('materia')
    .select('id_materia, nombre');
  if (matErr) throw matErr;

  const idsIngles = new Set(
    (materias ?? []).filter((m) => esMateriaIngles(m.nombre)).map((m) => m.id_materia)
  );
  if (idsIngles.size === 0) {
    console.log('No hay materias de inglés. Nada que traducir.');
    return;
  }
  console.log(`Materias de inglés encontradas: ${idsIngles.size}`);

  // 2) Ítems de esas materias sin traducción
  const { data: items, error: itemErr } = await supabase
    .from('item')
    .select('id_item, pregunta, pregunta_es, unidad:unidad_curricular!id_unidad(id_materia)')
    .is('pregunta_es', null);
  if (itemErr) throw itemErr;

  const pendientes = (items ?? []).filter((it) => idsIngles.has(it.unidad?.id_materia));
  console.log(`Ítems de inglés sin traducción: ${pendientes.length}`);
  if (pendientes.length === 0) return;

  // 3) Traducir en lotes y actualizar
  let traducidos = 0;
  let saltados = 0;
  for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
    const lote = pendientes.slice(i, i + TAMANO_LOTE);
    console.log(`Procesando ${i + 1}–${i + lote.length} de ${pendientes.length}...`);

    const traducciones = await translateQuestions(lote.map((it) => it.pregunta));

    for (let j = 0; j < lote.length; j++) {
      const trad = traducciones[j];
      if (!trad) { saltados++; continue; } // ya estaba en español / sin cambio
      const { error: updErr } = await supabase
        .from('item')
        .update({ pregunta_es: trad })
        .eq('id_item', lote[j].id_item);
      if (updErr) {
        console.error(`  Error al actualizar ${lote[j].id_item}: ${updErr.message}`);
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
