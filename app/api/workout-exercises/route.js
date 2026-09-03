import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

async function requireAuth() {
  const authClient = await createSupabaseServerClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const { data: profile } = await authClient.from('profiles').select('role, active').eq('id', user.id).maybeSingle();
  if (profile?.active === false) return { error: NextResponse.json({ error: 'Usuário desativado.' }, { status: 403 }) };
  return { user, profile };
}

async function requireStaff() {
  const auth = await requireAuth();
  if (auth.error) return auth;
  const role = auth.user.app_metadata?.role || auth.profile?.role;
  if (!['dev', 'admin'].includes(role)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return auth;
}

export async function GET(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const authClient = await createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const workoutId = searchParams.get('workoutId');

    if (!workoutId) {
      return NextResponse.json({ error: 'workoutId é obrigatório.' }, { status: 400 });
    }

    const { data: exercises, error } = await authClient
      .from('workout_exercises')
      .select('*, exercise:exercises(*)')
      .eq('workout_id', workoutId)
      .order('order_number', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ exercises });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { workout_id, exercise_id } = payload;

    if (!workout_id || !exercise_id) {
      return NextResponse.json({ error: 'workout_id e exercise_id são obrigatórios.' }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();

    // Contar exercícios existentes
    const { data: existing } = await authClient
      .from('workout_exercises')
      .select('id', { count: 'exact' })
      .eq('workout_id', workout_id);

    const orderNumber = (existing?.length || 0) + 1;

    const { data: exercise, error } = await authClient
      .from('workout_exercises')
      .insert({
        workout_id,
        exercise_id,
        order_number: orderNumber,
        series: payload.series || 3,
        repetitions: payload.repetitions || '10',
        weight: payload.weight || null,
        weight_unit: payload.weight_unit || 'kg',
        rest_seconds: payload.rest_seconds || 60,
        execution_time_seconds: payload.execution_time_seconds || null,
        method: payload.method?.trim() || null,
        observations: payload.observations?.trim() || null,
        video_url: payload.video_url?.trim() || null,
      })
      .select('*, exercise:exercises(*)')
      .single();

    if (error) throw error;
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { id } = payload;

    if (!id) return NextResponse.json({ error: 'ID é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();
    const { data: exercise, error } = await authClient
      .from('workout_exercises')
      .update({
        ...(payload.series !== undefined && { series: payload.series }),
        ...(payload.repetitions !== undefined && { repetitions: payload.repetitions }),
        ...(payload.weight !== undefined && { weight: payload.weight }),
        ...(payload.weight_unit !== undefined && { weight_unit: payload.weight_unit }),
        ...(payload.rest_seconds !== undefined && { rest_seconds: payload.rest_seconds }),
        ...(payload.execution_time_seconds !== undefined && { execution_time_seconds: payload.execution_time_seconds }),
        ...(payload.method !== undefined && { method: payload.method?.trim() || null }),
        ...(payload.observations !== undefined && { observations: payload.observations?.trim() || null }),
        ...(payload.video_url !== undefined && { video_url: payload.video_url?.trim() || null }),
        ...(payload.order_number !== undefined && { order_number: payload.order_number }),
      })
      .eq('id', id)
      .select('*, exercise:exercises(*)')
      .single();

    if (error) throw error;
    return NextResponse.json({ exercise });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();
    const { error } = await authClient
      .from('workout_exercises')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ message: 'Exercício removido do treino.' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
