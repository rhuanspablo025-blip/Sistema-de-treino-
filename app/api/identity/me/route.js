import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { getTursoClient } from '../../../../lib/mongodb';
import { resolveAuthenticatedIdentity } from '../../../../lib/identity-authorization.mjs';

export const runtime = 'nodejs';
export async function GET() {
  const access = await requireUser(); if (access.response) return access.response;
  try {
    const client = await getTursoClient();
    const actor = await resolveAuthenticatedIdentity(client, access.user);
    const result = await client.execute({ sql: 'SELECT full_name,username FROM identity_users WHERE id=?', args: [actor.id] });
    return NextResponse.json({ id: actor.id, role: actor.role, studentMode: actor.studentMode, name: result.rows[0]?.full_name, username: result.rows[0]?.username });
  } catch (error) { return NextResponse.json({ error: error.status ? error.message : 'Não foi possível carregar a conta.' }, { status: error.status || 500 }); }
}
