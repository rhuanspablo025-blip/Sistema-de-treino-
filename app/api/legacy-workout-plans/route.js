import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('active').eq('id', user.id).maybeSingle();
  if (profile?.active === false) return { error: NextResponse.json({ error: 'Usuário desativado.' }, { status: 403 }) };
  if (!['dev', 'admin'].includes(user.app_metadata?.role)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { supabase };
}

export async function PUT(request) {
  const access = await requireStaff();
  if (access.error) return access.error;

  try {
    const payload = await request.json();
    const studentId = String(payload.studentId || '');
    const title = String(payload.title || '').trim();
    const frequency = String(payload.frequency || '').trim();
    const goal = payload.goal == null ? null : String(payload.goal).trim();
    const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
    const id = payload.id == null ? undefined : Number(payload.id);

    if (!/^[0-9a-f-]{36}$/i.test(studentId) || title.length < 2 || title.length > 120 || frequency.length > 80 || goal?.length > 500 || exercises.length > 100 || (id !== undefined && !Number.isSafeInteger(id))) {
      return NextResponse.json({ error: 'Dados da ficha inválidos.' }, { status: 400 });
    }

    const { data, error } = await access.supabase
      .from('workout_plans')
      .upsert({ ...(id !== undefined && { id }), student_id: studentId, title, goal, frequency, exercises })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ workout: data });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar a ficha.' }, { status: 500 });
  }
}