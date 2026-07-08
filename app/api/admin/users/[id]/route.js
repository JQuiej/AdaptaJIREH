import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

// ── PATCH: editar nombre de usuario y/o grado de un docente/estudiante ──
async function editar(request, context) {
  try {
    const { id } = context.params;
    const body = await request.json();

    const patch = {};
    if (body.grado !== undefined) patch.grado = body.grado ? String(body.grado).trim() : null;
    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (!username) {
        return NextResponse.json({ error: 'El nombre de usuario no puede estar vacío', code: 'INVALID' }, { status: 400 });
      }
      const { data: existe } = await supabase
        .from('usuario')
        .select('id_usuario')
        .eq('nombre_usuario', username)
        .neq('id_usuario', id)
        .maybeSingle();
      if (existe) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese nombre', code: 'DUPLICATE' }, { status: 409 });
      }
      patch.nombre_usuario = username;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar', code: 'INVALID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('usuario')
      .update(patch)
      .eq('id_usuario', id)
      .in('rol', ['docente', 'estudiante'])   // no se editan administradores desde aquí
      .select('id_usuario, nombre_usuario, rol, grado, codigo_anonimo, debe_cambiar_clave')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Usuario no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      id:                 data.id_usuario,
      username:           data.nombre_usuario,
      role:               data.rol,
      grado:              data.grado,
      codigo:             data.codigo_anonimo,
      mustChangePassword: data.debe_cambiar_clave,
    });
  } catch (err) {
    return handleError(err);
  }
}

// ── DELETE: eliminar un docente/estudiante ─────────────────────
async function eliminar(request, context, user) {
  try {
    const { id } = context.params;
    if (id === user.id) {
      return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta', code: 'INVALID' }, { status: 400 });
    }

    // Si es docente con materias asignadas, se avisa (las materias quedarían sin
    // docente por la FK ON DELETE SET NULL). Se permite, pero con contexto.
    // Las FK ON DELETE CASCADE borran inscripciones, item_fsrs, sesiones, etc.
    const { data, error } = await supabase
      .from('usuario')
      .delete()
      .eq('id_usuario', id)
      .in('rol', ['docente', 'estudiante'])
      .select('id_usuario, rol')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Usuario no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return handleError(err);
  }
}

export const PATCH  = withAuth(editar,   'administrador');
export const DELETE = withAuth(eliminar, 'administrador');
