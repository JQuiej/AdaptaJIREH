import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

async function handler() {
  // JWT stateless: el cliente elimina el token.
  return NextResponse.json({ message: 'Sesión cerrada correctamente' });
}

export const POST = withAuth(handler);
