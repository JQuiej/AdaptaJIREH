import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('Falta variable de entorno JWT_SECRET');

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

/**
 * HOF que protege un Route Handler con verificación JWT.
 *
 * Uso:
 *   async function handler(req, ctx, user) { ... }
 *   export const GET = withAuth(handler, 'estudiante');
 */
export function withAuth(handler, requiredRole = null) {
  return async (request, context) => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Token no proporcionado', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    try {
      const user = jwt.verify(token, JWT_SECRET);
      if (requiredRole && user.role !== requiredRole) {
        return NextResponse.json(
          { error: 'Acceso no autorizado para este rol', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      return handler(request, context, user);
    } catch {
      return NextResponse.json(
        { error: 'Token inválido o expirado', code: 'INVALID_TOKEN' },
        { status: 401 }
      );
    }
  };
}
