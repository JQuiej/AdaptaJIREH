import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import { CLAVE_POR_DEFECTO, hashClave, siguienteCodigoAnonimo } from '@/lib/usuarios';

// ── GET: lista de estudiantes ──────────────────────────────────
async function listar(request, context, user) {
  try {
    const { data, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_usuario, grado, codigo_anonimo, debe_cambiar_clave, creado_en')
      .eq('rol', 'estudiante')
      .order('nombre_usuario');

    if (error) throw error;

    const students = (data ?? []).map((u) => ({
      id:                 u.id_usuario,
      username:           u.nombre_usuario,
      grado:              u.grado,
      codigo:             u.codigo_anonimo,
      mustChangePassword: u.debe_cambiar_clave,
      creado_en:          u.creado_en,
    }));

    return NextResponse.json(students);
  } catch (err) {
    return handleError(err);
  }
}

// ── POST: crear un estudiante ──────────────────────────────────
async function crear(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['username']);

    const username = String(body.username).trim();
    const grado    = body.grado ? String(body.grado).trim() : null;
    const password = body.password ? String(body.password) : CLAVE_POR_DEFECTO;
    const codigo   = body.codigo ? String(body.codigo).trim() : await siguienteCodigoAnonimo();

    // Nombre de usuario único.
    const { data: existe } = await supabase
      .from('usuario')
      .select('id_usuario')
      .eq('nombre_usuario', username)
      .maybeSingle();
    if (existe) {
      return NextResponse.json(
        { error: 'Ya existe un usuario con ese nombre', code: 'DUPLICATE' },
        { status: 409 }
      );
    }

    const clave_hash = await hashClave(password);
    // Si se crea con la contraseña por defecto, se le pedirá cambiarla al entrar.
    const usaDefault = password === CLAVE_POR_DEFECTO;

    const { data: nuevo, error } = await supabase
      .from('usuario')
      .insert({
        nombre_usuario:     username,
        codigo_anonimo:     codigo,
        clave_hash,
        rol:                'estudiante',
        grado,
        debe_cambiar_clave: usaDefault,
      })
      .select('id_usuario, nombre_usuario, grado, codigo_anonimo, debe_cambiar_clave')
      .single();

    if (error) throw error;

    // Inscribir automáticamente en todas las materias activas para que el
    // alumno vea contenido desde el inicio.
    const { data: materias } = await supabase
      .from('materia')
      .select('id_materia')
      .eq('activa', true);
    if (materias?.length) {
      await supabase.from('inscripcion').insert(
        materias.map((m) => ({ id_estudiante: nuevo.id_usuario, id_materia: m.id_materia }))
      );
    }

    return NextResponse.json(
      {
        student: {
          id:                 nuevo.id_usuario,
          username:           nuevo.nombre_usuario,
          grado:              nuevo.grado,
          codigo:             nuevo.codigo_anonimo,
          mustChangePassword: nuevo.debe_cambiar_clave,
        },
        // Se devuelve la contraseña asignada para que el docente se la comparta.
        password,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

export const GET  = withAuth(listar, 'docente');
export const POST = withAuth(crear,  'docente');
