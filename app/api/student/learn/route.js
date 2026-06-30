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
        unidad:unidad_curricular!id_unidad(id_unidad, nombre, id_materia, nivel_bloom)
      `);
    if (teoErr) throw teoErr;

    const relevantes = (teorias ?? []).filter(
      (t) => t.unidad && idsMaterias.includes(t.unidad.id_materia)
    );

    // Agrupar por materia y ordenar los temas en orden lógico de aprendizaje:
    // de lo más básico a lo más complejo (nivel de Bloom ascendente) y, dentro
    // del mismo nivel, por antigüedad (lo subido primero va primero).
    const resultado = materias.map((m) => ({
      id:     m.id_materia,
      nombre: m.nombre,
      temas:  relevantes
        .filter((t) => t.unidad.id_materia === m.id_materia)
        .sort((a, b) => {
          const db = (a.unidad.nivel_bloom ?? 99) - (b.unidad.nivel_bloom ?? 99);
          if (db !== 0) return db;
          return (a.creado_en ?? '').localeCompare(b.creado_en ?? '');
        })
        .map((t) => ({
          id:          t.id_teoria,
          unidad:      t.unidad.nombre,
          nivel_bloom: t.unidad.nivel_bloom,
          resumen:     t.resumen,
          secciones:   t.secciones ?? [],
        })),
    }));

    return NextResponse.json(resultado);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
