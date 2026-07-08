import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';
import {
  CLAVE_POR_DEFECTO, hashClave, siguienteCodigoAnonimo, inscribirEnMateria,
} from '@/lib/usuarios';

const PREFIJO = { estudiante: 'EST', docente: 'DOC', administrador: 'ADM' };

// ── GET: lista de usuarios (docentes y estudiantes) ────────────
// Se excluyen los administradores de la lista para no gestionarlos entre sí.
async function listar(request) {
  try {
    const { data, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_usuario, rol, grado, codigo_anonimo, debe_cambiar_clave, creado_en')
      .in('rol', ['docente', 'estudiante'])
      .order('rol')
      .order('nombre_usuario');
    if (error) throw error;

    // Nº de materias inscritas por estudiante (para mostrar en la lista).
    const estudianteIds = (data ?? []).filter((u) => u.rol === 'estudiante').map((u) => u.id_usuario);
    const conteo = {};
    if (estudianteIds.length) {
      const { data: inscr } = await supabase
        .from('inscripcion')
        .select('id_estudiante')
        .in('id_estudiante', estudianteIds);
      for (const i of inscr ?? []) conteo[i.id_estudiante] = (conteo[i.id_estudiante] ?? 0) + 1;
    }

    const users = (data ?? []).map((u) => ({
      id:                 u.id_usuario,
      username:           u.nombre_usuario,
      role:               u.rol,
      grado:              u.grado,
      codigo:             u.codigo_anonimo,
      mustChangePassword: u.debe_cambiar_clave,
      materias:           u.rol === 'estudiante' ? (conteo[u.id_usuario] ?? 0) : null,
      creado_en:          u.creado_en,
    }));

    return NextResponse.json(users);
  } catch (err) {
    return handleError(err);
  }
}

// ── POST: crear un usuario (docente o estudiante) ──────────────
async function crear(request) {
  try {
    const body = await request.json();
    requireFields(body, ['username', 'role']);

    const role = String(body.role);
    if (role !== 'docente' && role !== 'estudiante') {
      return NextResponse.json(
        { error: 'Rol inválido (solo docente o estudiante)', code: 'INVALID_ROLE' },
        { status: 400 }
      );
    }

    const username = String(body.username).trim();
    if (!username) {
      return NextResponse.json({ error: 'Nombre de usuario requerido', code: 'INVALID' }, { status: 400 });
    }
    const grado    = role === 'estudiante' && body.grado ? String(body.grado).trim() : null;
    const password = body.password ? String(body.password) : CLAVE_POR_DEFECTO;
    const codigo   = body.codigo ? String(body.codigo).trim() : await siguienteCodigoAnonimo(PREFIJO[role]);

    // Nombre de usuario único.
    const { data: existe } = await supabase
      .from('usuario')
      .select('id_usuario')
      .eq('nombre_usuario', username)
      .maybeSingle();
    if (existe) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese nombre', code: 'DUPLICATE' }, { status: 409 });
    }

    const clave_hash = await hashClave(password);
    const usaDefault = password === CLAVE_POR_DEFECTO;

    const { data: nuevo, error } = await supabase
      .from('usuario')
      .insert({
        nombre_usuario:     username,
        codigo_anonimo:     codigo,
        clave_hash,
        rol:                role,
        grado,
        debe_cambiar_clave: usaDefault,
      })
      .select('id_usuario, nombre_usuario, rol, grado, codigo_anonimo, debe_cambiar_clave')
      .single();
    if (error) throw error;

    // Si es estudiante, inscribirlo en las materias indicadas (o en todas las
    // activas si no se especifica ninguna) y asignarle todos sus ítems.
    let materiasAsignadas = 0;
    let itemsAsignados    = 0;
    if (role === 'estudiante') {
      let materiaIds = Array.isArray(body.materiaIds) ? body.materiaIds.filter(Boolean) : null;
      if (!materiaIds) {
        const { data: activas } = await supabase
          .from('materia').select('id_materia').eq('activa', true);
        materiaIds = (activas ?? []).map((m) => m.id_materia);
      }
      for (const mId of materiaIds) {
        itemsAsignados += await inscribirEnMateria(nuevo.id_usuario, mId);
        materiasAsignadas += 1;
      }
    }

    return NextResponse.json(
      {
        user: {
          id:                 nuevo.id_usuario,
          username:           nuevo.nombre_usuario,
          role:               nuevo.rol,
          grado:              nuevo.grado,
          codigo:             nuevo.codigo_anonimo,
          mustChangePassword: nuevo.debe_cambiar_clave,
          materias:           role === 'estudiante' ? materiasAsignadas : null,
        },
        password,        // se devuelve para compartirla con el usuario
        itemsAsignados,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

export const GET  = withAuth(listar, 'administrador');
export const POST = withAuth(crear,  'administrador');
