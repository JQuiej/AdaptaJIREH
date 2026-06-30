import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { handleError } from '@/lib/validate';
import { estadoRacha } from '@/lib/streak';

async function handler(request, context, user) {
  try {
    const estado = await estadoRacha(user.id);
    return NextResponse.json(estado);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'estudiante');
