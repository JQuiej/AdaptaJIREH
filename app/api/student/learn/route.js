import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// Devuelve los apuntes de teoría de las materias donde el estudiante está inscrito,
// agrupados por materia → unidad, para el apartado "Aprender".
async function handler(request, context, user) {
  try {
    // Materias del estudiante
    const { data: inscripciones, error: insErr } = await supabase
      .from('inscripcion')
      .select('id_materia, materia:materia!id_materia(id_materia, nombre, activa)')
      .eq('id_estudiante', user.id);
    if (insErr) throw insErr;

    const materias = (inscripciones ?? [])
      .map((i) => i.materia)
      .filter((m) => m?.activa);
    const idsMaterias = materias.map((m) => m.id_materia);
    if (idsMaterias.length === 0) return NextResponse.json([]);

    // Teoría de las unidades de esas materias
    const { data: teorias, error: teoErr } = await supabase
      .from('teoria')
      .select(`
        id_teoria, resumen, secciones, creado_en,
        unidad:unidad_curricular!id_unidad(id_unidad, nombre, id_materia)
      `)
      .order('creado_en', { ascending: false });
    if (teoErr) throw teoErr;

    const relevantes = (teorias ?? []).filter(
      (t) => t.unidad && idsMaterias.includes(t.unidad.id_materia)
    );

    // Agrupar por materia
    const resultado = materias.map((m) => ({
      id:     m.id_materia,
      nombre: m.nombre,
      temas:  relevantes
        .filter((t) => t.unidad.id_materia === m.id_materia)
        .map((t) => ({
          id:        t.id_teoria,
          unidad:    t.unidad.nombre,
          resumen:   t.resumen,
          secciones: t.secciones ?? [],
        })),
    }));

    return NextResponse.json(resultado);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
