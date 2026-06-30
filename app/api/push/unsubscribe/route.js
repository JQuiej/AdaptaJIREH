import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';

// Elimina la suscripción de este dispositivo (al desactivar en el navegador).
async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['endpoint']);
    const { error } = await supabase
      .from('push_subscription')
      .delete()
      .eq('id_usuario', user.id)
      .eq('endpoint', body.endpoint);
    if (error) throw error;
    return NextResponse.json({ message: 'Suscripción eliminada' });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'estudiante');
