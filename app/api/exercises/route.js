import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

export async function requireAuth() {
  const authClient = await createSupabaseServerClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const { data: profile } = await authClient.from('profiles').select('role, active').eq('id', user.id).maybeSingle();
  if (profile?.active === false) return { error: NextResponse.json({ error: 'Usuário desativado.' }, { status: 403 }) };
  return { user, profile };
}

export async function requireStaff() {
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
    const { data: exercises, error } = await authClient
      .from('exercises')
      .select('*')
      .order('created_at', { ascending: false });

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
    const { name, muscle_group, equipment, category, difficulty } = payload;

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Nome do exercício é obrigatório.' }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    const { data: exercise, error } = await authClient
      .from('exercises')
      .insert({
        name: name.trim(),
        muscle_group,
        equipment: equipment?.trim() || null,
        category: category?.trim() || null,
        description: payload.description?.trim() || null,
        instructions: payload.instructions?.trim() || null,
        video_url: payload.video_url?.trim() || null,
        image_url: payload.image_url?.trim() || null,
        difficulty,
        observations: payload.observations?.trim() || null,
        active: true,
        created_by: auth.user.id,
      })
      .select()
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
    const { id, name, muscle_group, equipment, category, difficulty, active } = payload;

    if (!id) return NextResponse.json({ error: 'ID do exercício é obrigatório.' }, { status: 400 });
    if (name && name.trim().length < 2) {
      return NextResponse.json({ error: 'Nome deve ter ao menos 2 caracteres.' }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    const { data: exercise, error } = await authClient
      .from('exercises')
      .update({
        ...(name && { name: name.trim() }),
        ...(muscle_group && { muscle_group }),
        ...(equipment && { equipment: equipment.trim() }),
        ...(category && { category: category.trim() }),
        ...(difficulty && { difficulty }),
        ...(payload.description !== undefined && { description: payload.description?.trim() || null }),
        ...(payload.instructions !== undefined && { instructions: payload.instructions?.trim() || null }),
        ...(payload.video_url !== undefined && { video_url: payload.video_url?.trim() || null }),
        ...(payload.image_url !== undefined && { image_url: payload.image_url?.trim() || null }),
        ...(payload.observations !== undefined && { observations: payload.observations?.trim() || null }),
        ...(active !== undefined && { active }),
      })
      .eq('id', id)
      .select()
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
    
    // Verificar se exercício está sendo usado em fichas
    const { data: usedIn, error: checkError } = await authClient
      .from('workout_exercises')
      .select('id', { count: 'exact' })
      .eq('exercise_id', id);

    if (checkError) throw checkError;

    if (usedIn && usedIn.length > 0) {
      // Desativar em vez de deletar
      const { error: deactivateError } = await authClient
        .from('exercises')
        .update({ active: false })
        .eq('id', id);
      
      if (deactivateError) throw deactivateError;
      return NextResponse.json({ message: 'Exercício desativado (estava em uso).' });
    }

    // Deletar se não estiver em uso
    const { error: deleteError } = await authClient
      .from('exercises')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
    return NextResponse.json({ message: 'Exercício deletado.' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
