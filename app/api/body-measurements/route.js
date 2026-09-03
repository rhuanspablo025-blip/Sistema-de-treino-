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

export async function GET(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const authClient = await createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    // Aluno pode acessar apenas suas medidas
    const role = auth.user.app_metadata?.role || auth.profile?.role;
    let query = authClient.from('body_measurements').select('*');

    if (!['dev', 'admin'].includes(role)) {
      query = query.eq('student_id', auth.user.id);
    } else if (studentId) {
      query = query.eq('student_id', studentId);
    } else {
      query = query.eq('student_id', auth.user.id);
    }

    const { data: measurements, error } = await query.order('measured_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ measurements });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { student_id } = payload;

    // Aluno só pode adicionar suas próprias medidas
    const role = auth.user.app_metadata?.role || auth.profile?.role;
    const allowedStudentId = ['dev', 'admin'].includes(role) ? student_id : auth.user.id;

    if (!allowedStudentId) {
      return NextResponse.json({ error: 'student_id é obrigatório.' }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    const { data: measurement, error } = await authClient
      .from('body_measurements')
      .insert({
        student_id: allowedStudentId,
        measured_at: payload.measured_at || new Date().toISOString().split('T')[0],
        height: payload.height || null,
        weight: payload.weight || null,
        shoulder: payload.shoulder || null,
        chest: payload.chest || null,
        waist: payload.waist || null,
        hip: payload.hip || null,
        arm_left: payload.arm_left || null,
        arm_right: payload.arm_right || null,
        thigh_left: payload.thigh_left || null,
        thigh_right: payload.thigh_right || null,
        leg_left: payload.leg_left || null,
        leg_right: payload.leg_right || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ measurement }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { id } = payload;

    if (!id) return NextResponse.json({ error: 'ID é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();
    const { data: measurement, error } = await authClient
      .from('body_measurements')
      .update({
        ...(payload.height !== undefined && { height: payload.height }),
        ...(payload.weight !== undefined && { weight: payload.weight }),
        ...(payload.shoulder !== undefined && { shoulder: payload.shoulder }),
        ...(payload.chest !== undefined && { chest: payload.chest }),
        ...(payload.waist !== undefined && { waist: payload.waist }),
        ...(payload.hip !== undefined && { hip: payload.hip }),
        ...(payload.arm_left !== undefined && { arm_left: payload.arm_left }),
        ...(payload.arm_right !== undefined && { arm_right: payload.arm_right }),
        ...(payload.thigh_left !== undefined && { thigh_left: payload.thigh_left }),
        ...(payload.thigh_right !== undefined && { thigh_right: payload.thigh_right }),
        ...(payload.leg_left !== undefined && { leg_left: payload.leg_left }),
        ...(payload.leg_right !== undefined && { leg_right: payload.leg_right }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ measurement });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID é obrigatório.' }, { status: 400 });

    const authClient = await createSupabaseServerClient();
    const { error } = await authClient
      .from('body_measurements')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ message: 'Medida deletada.' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
