import { NextResponse } from 'next/server';

/** Lanza un error 400 si faltan campos requeridos en el body. */
export function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ''
  );
  if (missing.length > 0) {
    const err = new Error(`Campos requeridos: ${missing.join(', ')}`);
    err.status = 400;
    err.code = 'MISSING_FIELDS';
    throw err;
  }
}

/** Convierte un error en NextResponse con formato estándar { error, code }. */
export function handleError(err) {
  console.error('[AdaptaJIREH]', err.message, err.stack ?? '');
  return NextResponse.json(
    { error: err.message, code: err.code ?? 'INTERNAL_ERROR' },
    { status: err.status ?? 500 }
  );
}
