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
    const studentId = searchParams.get('studentId');

    let query = authClient.from('workout_plans_v2').select('*');

    // Se não for staff, filtrar apenas fichas do próprio aluno
    const role = auth.user.app_metadata?.role || auth.profile?.role;
    if (!['dev', 'admin'].includes(role)) {
      query = query.eq('student_id', auth.user.id);
    } else if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data: plans, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ plans });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { name, student_id, goal, status } = payload;

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Nome da ficha é obrigatório.' }, { status: 400 });
    }
    if (!student_id) {
      return NextResponse.json({ error: 'Aluno é obrigatório.' }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    const { data: plan, error } = await authClient
      .from('workout_plans_v2')
      .insert({
        name: name.trim(),
        student_id,
        professor_id: auth.user.id,
        goal: goal?.trim() || null,
        status: status || 'ativa',
        observations: payload.observations?.trim() || null,
        start_date: payload.start_date || new Date().toISOString().split('T')[0],
        end_date: payload.end_date || null,
        frequency: payload.frequency?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ plan }, { status: 201 });
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

    if (!id) return NextResponse.json({ error: 'ID da ficha é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();
    const { data: plan, error } = await authClient
      .from('workout_plans_v2')
      .update({
        ...(payload.name && { name: payload.name.trim() }),
        ...(payload.goal !== undefined && { goal: payload.goal?.trim() || null }),
        ...(payload.status && { status: payload.status }),
        ...(payload.observations !== undefined && { observations: payload.observations?.trim() || null }),
        ...(payload.end_date !== undefined && { end_date: payload.end_date }),
        ...(payload.frequency !== undefined && { frequency: payload.frequency?.trim() || null }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ plan });
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
      .from('workout_plans_v2')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ message: 'Ficha deletada.' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
