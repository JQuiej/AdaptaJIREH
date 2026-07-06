import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { signToken } from '@/lib/auth';
import { requireFields, handleError } from '@/lib/validate';

export async function POST(request) {
  try {
    const body = await request.json();
    requireFields(body, ['username', 'password']);
    const { username, password } = body;

    const { data: dbUser, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_usuario, clave_hash, rol, grado, debe_cambiar_clave')
      .eq('nombre_usuario', username.trim())
      .single();

    if (error || !dbUser || !(await bcrypt.compare(password, dbUser.clave_hash))) {
      return NextResponse.json(
        { error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // JWT payload en inglés (contrato de API entre cliente y servidor)
    const payload = {
      id:       dbUser.id_usuario,
      username: dbUser.nombre_usuario,
      role:     dbUser.rol,
      grade:    dbUser.grado,
    };

    // mustChangePassword no va en el token (podría quedar obsoleto tras el
    // cambio); se envía solo en el objeto user para el flujo de UI.
    return NextResponse.json({
      token: signToken(payload),
      user:  { ...payload, mustChangePassword: dbUser.debe_cambiar_clave },
    });
  } catch (err) {
    return handleError(err);
  }
}
