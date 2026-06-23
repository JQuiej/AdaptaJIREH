import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/validate';

async function handler() {
  try {
    const { data, error } = await supabase.rpc('get_at_risk_students');
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAuth(handler, 'docente');
