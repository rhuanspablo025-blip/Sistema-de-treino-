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
    const workoutPlanId = searchParams.get('workoutPlanId');

    if (!workoutPlanId) {
      return NextResponse.json({ error: 'workoutPlanId é obrigatório.' }, { status: 400 });
    }

    const { data: workouts, error } = await authClient
      .from('workouts')
      .select('*')
      .eq('workout_plan_id', workoutPlanId)
      .order('order_number', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ workouts });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { workout_plan_id, name, day_of_week } = payload;

    if (!workout_plan_id) {
      return NextResponse.json({ error: 'workout_plan_id é obrigatório.' }, { status: 400 });
    }
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Nome do treino é obrigatório.' }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    
    // Contar treinos existentes para determinar order_number
    const { data: existing } = await authClient
      .from('workouts')
      .select('id', { count: 'exact' })
      .eq('workout_plan_id', workout_plan_id);

    const orderNumber = (existing?.length || 0) + 1;

    const { data: workout, error } = await authClient
      .from('workouts')
      .insert({
        workout_plan_id,
        name: name.trim(),
        day_of_week: day_of_week?.trim() || null,
        description: payload.description?.trim() || null,
        order_number: orderNumber,
        observations: payload.observations?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ workout }, { status: 201 });
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

    if (!id) return NextResponse.json({ error: 'ID do treino é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();
    const { data: workout, error } = await authClient
      .from('workouts')
      .update({
        ...(payload.name && { name: payload.name.trim() }),
        ...(payload.day_of_week !== undefined && { day_of_week: payload.day_of_week?.trim() || null }),
        ...(payload.description !== undefined && { description: payload.description?.trim() || null }),
        ...(payload.order_number !== undefined && { order_number: payload.order_number }),
        ...(payload.observations !== undefined && { observations: payload.observations?.trim() || null }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ workout });
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
      .from('workouts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ message: 'Treino deletado.' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
