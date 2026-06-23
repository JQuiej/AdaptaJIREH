import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';

async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['sessionId']);

    const { error } = await supabase.rpc('cerrar_sesion', {
      p_id_sesion: body.sessionId,
    });

    if (error) throw error;
    return NextResponse.json({ message: 'Sesión finalizada' });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'estudiante');
