import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';
import { generateDailyFact } from '@/lib/llm';

// Fecha "de hoy" en horario de Guatemala (el día cambia a medianoche local).
const fechaHoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

// Dato curioso diario: se genera UNA vez por día por estudiante, a partir de los
// temas ACTIVOS (visibles) y asignados al alumno, y se muestra solo la primera
// vez que entra ese día. Si falla la IA o no hay temas, no bloquea el ingreso
// (devuelve fact:null y el panel carga normal).
//
// IMPORTANTE: el GET NO marca "visto". Solo genera/devuelve el dato mientras no
// se haya visto. El frontend confirma la visualización con POST (marcarVisto).
// Así, si la respuesta nunca se muestra (recarga, doble render, red caída), el
// dato NO se pierde: seguirá apareciendo hasta que se muestre de verdad.
async function handler(request, context, user) {
  try {
    const hoy = fechaHoy();

    // ¿Ya hay dato para hoy? Si ya se mostró, no se vuelve a mostrar.
    const { data: existente } = await supabase
      .from('dato_curioso')
      .select('id_dato, texto, tema, visto')
      .eq('id_estudiante', user.id)
      .eq('fecha', hoy)
      .maybeSingle();

    if (existente) {
      return existente.visto
        ? NextResponse.json({ fact: null })
        : NextResponse.json({ fact: { texto: existente.texto, tema: existente.tema } });
    }

    // ── Reunir los temas activos y asignados al alumno ──────────
    // Materias donde está inscrito y que estén activas.
    const { data: inscripciones } = await supabase
      .from('inscripcion')
      .select('materia:materia!id_materia(id_materia, nombre, activa)')
      .eq('id_estudiante', user.id);

    const materias = (inscripciones ?? []).map((i) => i.materia).filter((m) => m?.activa);
    const nombreMateria = new Map(materias.map((m) => [m.id_materia, m.nombre]));
    const idsMaterias = materias.map((m) => m.id_materia);
    if (idsMaterias.length === 0) return NextResponse.json({ fact: null });

    // Ítems asignados al alumno (item_fsrs) cuyos temas estén visibles.
    const { data: fsrsRows } = await supabase
      .from('item_fsrs')
      .select('item:item!id_item(unidad:unidad_curricular!id_unidad(id_unidad, nombre, id_materia, visible))')
      .eq('id_estudiante', user.id);

    const unidadesMap = new Map(); // id_unidad → { id, nombre, id_materia }
    for (const r of fsrsRows ?? []) {
      const u = r.item?.unidad;
      if (u?.visible && idsMaterias.includes(u.id_materia) && !unidadesMap.has(u.id_unidad)) {
        unidadesMap.set(u.id_unidad, u);
      }
    }
    if (unidadesMap.size === 0) return NextResponse.json({ fact: null });

    // Resumen de la teoría de esos temas (contexto para no inventar).
    const { data: teorias } = await supabase
      .from('teoria')
      .select('id_unidad, resumen')
      .in('id_unidad', [...unidadesMap.keys()]);
    const resumenPorUnidad = new Map((teorias ?? []).map((t) => [t.id_unidad, t.resumen]));

    const temas = [...unidadesMap.values()].map((u) => ({
      materia: nombreMateria.get(u.id_materia) ?? 'Materia',
      tema:    u.nombre,
      resumen: resumenPorUnidad.get(u.id_unidad) ?? '',
    }));

    // ── Generar con IA (no crítico: si falla, no se muestra nada) ──
    let generado = null;
    try {
      generado = await generateDailyFact({ temas });
    } catch (e) {
      console.warn('[daily-fact] IA no disponible:', e.message);
      return NextResponse.json({ fact: null });
    }
    if (!generado?.texto) return NextResponse.json({ fact: null });

    // Guardar SIN marcar visto (se marca cuando el frontend lo muestre). Ante una
    // carrera (doble entrada), el UNIQUE(id_estudiante, fecha) evita duplicados:
    // se devuelve el existente.
    const { data: insertado, error: insErr } = await supabase
      .from('dato_curioso')
      .insert({ id_estudiante: user.id, fecha: hoy, texto: generado.texto, tema: generado.tema || null, visto: false })
      .select('texto, tema')
      .single();

    if (insErr) {
      const { data: ya } = await supabase
        .from('dato_curioso')
        .select('texto, tema')
        .eq('id_estudiante', user.id)
        .eq('fecha', hoy)
        .maybeSingle();
      return NextResponse.json({ fact: ya ? { texto: ya.texto, tema: ya.tema } : null });
    }

    return NextResponse.json({ fact: { texto: insertado.texto, tema: insertado.tema } });
  } catch (err) {
    return handleError(err);
  }
}

// POST → marca el dato de hoy como visto (el frontend lo llama cuando ya lo
// mostró). Idempotente: llamarlo varias veces no cambia el resultado.
async function marcarVisto(request, context, user) {
  try {
    await supabase
      .from('dato_curioso')
      .update({ visto: true })
      .eq('id_estudiante', user.id)
      .eq('fecha', fechaHoy());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export const GET  = withAuth(handler, 'estudiante');
export const POST = withAuth(marcarVisto, 'estudiante');
