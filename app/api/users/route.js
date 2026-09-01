import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireStaff() {
  const authClient = await createSupabaseServerClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const { data: profile } = await authClient.from('profiles').select('role, active').eq('id', user.id).maybeSingle();
  if (profile?.active === false) return { error: NextResponse.json({ error: 'Usuário desativado.' }, { status: 403 }) };
  const role = user.app_metadata?.role || profile?.role;
  if (!['dev', 'admin'].includes(role)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { user };
}

function validatePayload(payload, { passwordRequired = true } = {}) {
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const confirmPassword = String(payload.confirmPassword || '');
  const role = String(payload.role || 'student');
  if (name.length < 2) return 'Informe o nome completo.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Informe um e-mail válido.';
  if (!['dev', 'admin', 'student'].includes(role)) return 'Perfil inválido.';
  if (passwordRequired && password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (password && password !== confirmPassword) return 'As senhas não conferem.';
  return null;
}

function publicUser(user, profile) {
  return { id: user.id, email: user.email, name: profile?.full_name || user.user_metadata?.full_name || '', role: profile?.role || user.app_metadata?.role || 'student', active: profile?.active ?? !user.banned_until, createdAt: profile?.created_at || user.created_at, updatedAt: profile?.updated_at || user.updated_at };
}

export async function GET() {
  const access = await requireStaff();
  if (access.error) return access.error;
  try {
    const admin = getAdminClient();
    const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from('profiles').select('id, full_name, role, active, created_at, updated_at'),
    ]);
    if (usersError) throw usersError;
    if (profilesError) throw profilesError;
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    return NextResponse.json({ users: (users || []).map((user) => publicUser(user, profileMap.get(user.id))) });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível carregar os usuários.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.error) return access.error;
  try {
    const payload = await request.json();
    const validationError = validatePayload(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const admin = getAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: payload.email.trim().toLowerCase(), password: payload.password, email_confirm: true, user_metadata: { full_name: payload.name.trim() }, app_metadata: { role: payload.role } });
    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });
    const { data: profile, error: profileError } = await admin.from('profiles').upsert({ id: created.user.id, full_name: payload.name.trim(), role: payload.role, active: payload.active !== false }).select().single();
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    return NextResponse.json({ user: publicUser(created.user, profile) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível criar o usuário.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.error) return access.error;
  try {
    const payload = await request.json();
    if (!payload.id) return NextResponse.json({ error: 'Usuário não informado.' }, { status: 400 });
    const validationError = validatePayload(payload, { passwordRequired: false });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const admin = getAdminClient();
    const authUpdate = { email: payload.email.trim().toLowerCase(), user_metadata: { full_name: payload.name.trim() }, app_metadata: { role: payload.role } };
    if (payload.password) authUpdate.password = payload.password;
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(payload.id, authUpdate);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const { data: profile, error: profileError } = await admin.from('profiles').update({ full_name: payload.name.trim(), role: payload.role, active: payload.active !== false }).eq('id', payload.id).select().single();
    if (profileError) throw profileError;
    return NextResponse.json({ user: publicUser(updated.user, profile) });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar o usuário.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.error) return access.error;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id || id === access.user.id) return NextResponse.json({ error: 'Não é possível excluir este usuário.' }, { status: 400 });
    const { error } = await getAdminClient().auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível excluir o usuário.' }, { status: 500 });
  }
}
