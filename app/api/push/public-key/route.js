import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { handleError } from '@/lib/validate';

// Devuelve la clave pública VAPID que el cliente necesita para suscribirse.
async function handler() {
  try {
    return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
