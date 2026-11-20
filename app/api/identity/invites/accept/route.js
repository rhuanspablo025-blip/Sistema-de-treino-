import { NextResponse } from 'next/server';
import { requireUser } from '../../../../../lib/api-auth';
import { getTursoClient } from '../../../../../lib/mongodb';
import { resolveAuthenticatedIdentity } from '../../../../../lib/identity-authorization.mjs';
import { acceptRelationshipInvite } from '../../../../../lib/identity-relationships.mjs';

export const runtime = 'nodejs';
export async function POST(request) {
  const access = await requireUser(); if (access.response) return access.response;
  try {
    const client = await getTursoClient();
    const actor = await resolveAuthenticatedIdentity(client, access.user);
    const body = await request.json();
    if (typeof body?.credential !== 'string') return NextResponse.json({ error: 'Convite invalido.' }, { status: 400 });
    return NextResponse.json(await acceptRelationshipInvite(client, actor, body.credential));
  } catch (error) { return NextResponse.json({ error: error.status ? error.message : 'Nao foi possivel aceitar o convite.' }, { status: error.status || 500 }); }
}
