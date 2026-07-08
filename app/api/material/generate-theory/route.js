import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { extractTextFromPDF } from '@/lib/pdf';
import { generateTheory } from '@/lib/llm';
import { esMateriaIngles } from '@/lib/idioma';

// Genera (o regenera) SOLO los apuntes de teoría de un tema a partir de un PDF,
// sin crear ítems nuevos. Reemplaza la teoría existente del tema. Útil cuando un
// tema quedó sin teoría (p. ej. si esa generación falló durante la subida).
async function handler(request) {
  try {
    const formData = await request.formData();
    const file   = formData.get('pdf');
    const unitId = formData.get('unitId');

    if (!file || !unitId) {
      return NextResponse.json(
        { error: 'pdf y unitId son requeridos', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    const { data: unidad, error: unitErr } = await supabase
      .from('unidad_curricular')
      .select('id_unidad, nombre, materia:materia!id_materia(nombre)')
      .eq('id_unidad', unitId)
      .single();

    if (unitErr || !unidad) {
      return NextResponse.json({ error: 'Tema no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractTextFromPDF(buffer);
    if (extractedText.length < 100) {
      return NextResponse.json(
        { error: 'El PDF no tiene suficiente texto. Verifica que sea un PDF con texto seleccionable.', code: 'INVALID_PDF' },
        { status: 400 }
      );
    }

    // Preguntas ya existentes del tema, para que la teoría explique sus conceptos.
    const { data: itemsTema } = await supabase
      .from('item')
      .select('pregunta')
      .eq('id_unidad', unitId);
    const preguntas = (itemsTema ?? []).map((i) => i.pregunta).filter(Boolean);

    const subjectName = unidad.materia?.nombre ?? 'Materia';
    const theory = await generateTheory({
      extractedText,
      subjectName,
      unitName:    unidad.nombre,
      preguntas,
      esIngles:    esMateriaIngles(subjectName),
    });

    if (!theory || (!theory.resumen && !(theory.secciones?.length))) {
      return NextResponse.json(
        { error: 'No se pudo generar la teoría. Intenta de nuevo.', code: 'EMPTY_THEORY' },
        { status: 502 }
      );
    }

    // Reemplazar la teoría existente del tema (evita duplicados).
    await supabase.from('teoria').delete().eq('id_unidad', unitId);
    const { error: insErr } = await supabase.from('teoria').insert({
      id_unidad: unitId,
      resumen:   theory.resumen ?? '',
      secciones: theory.secciones ?? [],
    });
    if (insErr) throw insErr;

    return NextResponse.json({
      theory,
      message: `Teoría generada para «${unidad.nombre}» (${theory.secciones?.length ?? 0} secciones).`,
    });
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
