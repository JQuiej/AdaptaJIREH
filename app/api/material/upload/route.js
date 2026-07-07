import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { extractTextFromPDF } from '@/lib/pdf';
import { generateItemsByLevel, generateTheory, MAX_CONTEXT_CHARS } from '@/lib/llm';
import { esMateriaIngles } from '@/lib/idioma';

// Mínimo de ítems por nivel Bloom, para no dejar niveles con muy pocos ítems.
const MIN_POR_NIVEL = 3;

// Genera una PREVISUALIZACIÓN de ítems a partir del PDF. NO los guarda en BD;
// el docente los revisa y luego confirma con /api/material/save.
// Genera automáticamente `perLevel` ítems por cada uno de los 4 niveles de Bloom.
async function handler(request) {
  try {
    const formData = await request.formData();
    const file     = formData.get('pdf');
    const unitId   = formData.get('unitId');
    const perLevel = Math.max(MIN_POR_NIVEL, parseInt(formData.get('perLevel') ?? '5', 10) || 5);

    if (!file || !unitId) {
      return NextResponse.json(
        { error: 'pdf y unitId son requeridos', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    // Obtener datos de la unidad
    const { data: unidad, error: unitErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, materia:materia!id_materia(id_materia, nombre)')
      .eq('id_unidad', unitId)
      .single();

    if (unitErr || !unidad) {
      return NextResponse.json(
        { error: 'Tema no encontrado', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Extraer texto del PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractTextFromPDF(buffer);
    if (extractedText.length < 100) {
      return NextResponse.json(
        { error: 'El PDF no tiene suficiente texto. Verifica que sea un PDF con texto seleccionable.', code: 'INVALID_PDF' },
        { status: 400 }
      );
    }

    const subjectName = unidad.materia?.nombre ?? 'Materia';
    const unitName    = unidad.nombre;

    // Generar ítems distribuidos en los 4 niveles Bloom (crítico, con reintentos)
    // y luego la teoría (no crítica). Secuencial para no saturar Gemini (503).
    const items = await generateItemsByLevel({
      extractedText, subjectName, unitName, perLevel,
      esIngles: esMateriaIngles(subjectName),
    });

    let theory = null;
    try {
      theory = await generateTheory({ extractedText, subjectName, unitName });
    } catch (e) {
      console.warn('[upload] teoría no generada (no crítico):', e.message);
    }

    return NextResponse.json({
      items, // cada ítem incluye su nivel `bloom`
      theory, // { resumen, secciones } — apuntes de estudio
      // Se devuelve el texto (truncado al que realmente usa el modelo) para poder
      // "generar más" sin re-subir el PDF.
      extractedText: extractedText.slice(0, MAX_CONTEXT_CHARS),
      subjectName,
      unitName,
    });
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many')) {
      return NextResponse.json(
        { error: 'Cuota de Gemini agotada. Activa la facturación en Google AI Studio o espera unos minutos.', code: 'QUOTA_EXCEEDED' },
        { status: 503 }
      );
    }
    if (err.message?.includes('Gemini') || err.message?.includes('GenerativeAI') || err.message?.includes('503')) {
      return NextResponse.json(
        { error: 'Servicio Gemini no disponible. Intenta de nuevo.', code: 'LLM_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'docente');
