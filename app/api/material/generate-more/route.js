import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { generateItems } from '@/lib/llm';

// Genera ítems ADICIONALES sobre el mismo material/nivel, excluyendo las preguntas
// que el docente ya tiene en pantalla para no repetir. No guarda en BD.
async function handler(request) {
  try {
    const body = await request.json();
    requireFields(body, ['extractedText', 'unitId', 'bloomLevel']);
    const {
      extractedText,
      unitId,
      bloomLevel,
      itemCount = 5,
      excludeQuestions = [],
    } = body;

    const { data: unidad, error: unitErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, materia:materia!id_materia(nombre)')
      .eq('id_unidad', unitId)
      .single();

    if (unitErr || !unidad) {
      return NextResponse.json(
        { error: 'Unidad no encontrada', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const items = await generateItems({
      extractedText,
      subjectName: unidad.materia?.nombre ?? 'Materia',
      unitName:    unidad.nombre,
      bloomLevel:  parseInt(bloomLevel, 10),
      itemCount:   parseInt(itemCount, 10),
      excludeQuestions,
    });

    return NextResponse.json({ items });
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many')) {
      return NextResponse.json(
        { error: 'Cuota de Gemini agotada. Espera unos minutos.', code: 'QUOTA_EXCEEDED' },
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
