import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { getTursoClient } from '../../../../lib/mongodb';
import { resolveAuthenticatedIdentity, requirePersonalAccess } from '../../../../lib/identity-authorization.mjs';
import { createRelationshipInvite, getRelationshipInvite, cancelRelationshipInvite } from '../../../../lib/identity-relationships.mjs';
import { sendRelationshipInvite } from '../../../../lib/identity-delivery.mjs';

export const runtime = 'nodejs';
const fail = (error) => NextResponse.json({ error: error.status ? error.message : 'Nao foi possivel processar o convite.' }, { status: error.status || 500 });

export async function GET(request) {
  try {
    const code = new URL(request.url).searchParams.get('credential');
    const client = await getTursoClient();
    if (code) return NextResponse.json(await getRelationshipInvite(client, code));
    const access = await requireUser(); if (access.response) return access.response;
    const actor = requirePersonalAccess(await resolveAuthenticatedIdentity(client, access.user));
    const page = Math.max(1, Number.parseInt(new URL(request.url).searchParams.get('page') || '1', 10) || 1);
    const [rows, pending] = await Promise.all([
      client.execute({ sql: 'SELECT id,expires_at,accepted_at,revoked_at,created_at FROM identity_invites WHERE personal_id=? ORDER BY created_at DESC LIMIT 25 OFFSET ?', args: [actor.id, (page - 1) * 25] }),
      client.execute({ sql: 'SELECT COUNT(*) AS total FROM identity_invites WHERE personal_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?', args: [actor.id, new Date().toISOString()] }),
    ]);
    return NextResponse.json({ invites: rows.rows.map((row) => ({ id: row.id, createdAt: row.created_at, expiresAt: row.expires_at, status: row.revoked_at ? 'CANCELLED' : row.accepted_at ? 'ACCEPTED' : row.expires_at <= new Date().toISOString() ? 'EXPIRED' : 'PENDING' })), pending: Number(pending.rows[0].total), page });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  const access = await requireUser(); if (access.response) return access.response;
  try {
    const client = await getTursoClient();
    const actor = requirePersonalAccess(await resolveAuthenticatedIdentity(client, access.user));
    const body = await request.json();
    const invite = await createRelationshipInvite(client, actor, { email: body?.email, studentId: body?.studentId });
    let delivery = { status: 'NOT_REQUESTED' };
    if (body?.email) {
      const owner = await client.execute({ sql: 'SELECT full_name FROM identity_users WHERE id=?', args: [actor.id] });
      const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const link = `${base}/convite?credential=${encodeURIComponent(invite.token)}`;
      try { delivery = await sendRelationshipInvite({ destination: body.email, personalName: owner.rows[0]?.full_name || 'Seu Personal', link, code: invite.code, expiresAt: invite.expiresAt }); }
      catch { delivery = { status: 'FAILED' }; }
    }
    return NextResponse.json({ ...invite, delivery }, { status: 201 });
  } catch (error) { return fail(error); }
}

export async function DELETE(request) {
  const access = await requireUser(); if (access.response) return access.response;
  try {
    const client = await getTursoClient();
    const actor = requirePersonalAccess(await resolveAuthenticatedIdentity(client, access.user));
    await cancelRelationshipInvite(client, actor, new URL(request.url).searchParams.get('id'));
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
