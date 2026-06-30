import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requireFields, handleError } from '@/lib/validate';

// Guarda (o actualiza) la suscripción Web Push de un dispositivo del alumno.
async function handler(request, context, user) {
  try {
    const body = await request.json();
    requireFields(body, ['subscription']);
    const { endpoint, keys } = body.subscription ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Suscripción inválida', code: 'BAD_SUBSCRIPTION' }, { status: 400 });
    }

    const { error } = await supabase
      .from('push_subscription')
      .upsert(
        { id_usuario: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: 'endpoint' }
      );
    if (error) throw error;

    return NextResponse.json({ message: 'Suscripción guardada' }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAuth(handler, 'estudiante');
