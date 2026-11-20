import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { getTursoClient } from '../../../../lib/mongodb';
import { resolveAuthenticatedIdentity } from '../../../../lib/identity-authorization.mjs';
import { changeRelationship, contractedCapacity } from '../../../../lib/identity-relationships.mjs';

export const runtime = 'nodejs';
export async function GET(request) {
  const access = await requireUser(); if (access.response) return access.response;
  try {
    const client = await getTursoClient(), actor = await resolveAuthenticatedIdentity(client, access.user);
    const params = new URL(request.url).searchParams;
    const page = Math.min(10000, Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1));
    if (actor.role === 'PERSONAL') {
      const query = (params.get('q') || '').trim().slice(0, 80).replace(/[\\%_]/g, '\\$&');
      const status = params.get('status');
      const id = params.get('id');
      const terms = [`r.personal_id=?`], args = [actor.id];
      if (params.get('scope') !== 'all') terms.push(`r.status IN ('ACTIVE','SUSPENDED')`);
      if (query) { terms.push(`(u.full_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')`); args.push(`%${query}%`, `%${query}%`); }
      if (status && ['ACTIVE','SUSPENDED','TERMINATED'].includes(status)) { terms.push('r.status=?'); args.push(status); }
      if (id) { terms.push('u.id=?'); args.push(id); }
      const where = terms.join(' AND ');
      const [result, count, metrics, capacity] = await Promise.all([
        client.execute({ sql: `SELECT r.id,r.status,r.created_at,r.accepted_at,u.id AS student_id,u.full_name,u.username,u.status AS account_status FROM identity_relationships r JOIN identity_users u ON u.id=r.student_id WHERE ${where} ORDER BY r.created_at DESC LIMIT 25 OFFSET ?`, args: [...args, (page - 1) * 25] }),
        client.execute({ sql: `SELECT COUNT(*) AS total FROM identity_relationships r JOIN identity_users u ON u.id=r.student_id WHERE ${where}`, args }),
        client.execute({ sql: `SELECT SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status IN ('ACTIVE','SUSPENDED') THEN 1 ELSE 0 END) AS occupied FROM identity_relationships WHERE personal_id=?`, args: [actor.id] }),
        contractedCapacity(client, actor.id),
      ]);
      if (id && !result.rows.length) return NextResponse.json({ error: 'Aluno indisponível.' }, { status: 404 });
      return NextResponse.json({ relationships: result.rows, page, total: Number(count.rows[0].total), active: Number(metrics.rows[0].active || 0), occupied: Number(metrics.rows[0].occupied || 0), capacity });
    }
    if (actor.role === 'ALUNO') {
      const result = await client.execute({ sql: `SELECT r.id,r.status,r.created_at,p.id AS personal_id,p.full_name AS personal_name FROM identity_relationships r JOIN identity_users p ON p.id=r.personal_id WHERE r.student_id=? ORDER BY r.created_at DESC LIMIT 25 OFFSET ?`, args: [actor.id, (page - 1) * 25] });
      return NextResponse.json({ relationships: result.rows, page });
    }
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  } catch (error) { return NextResponse.json({ error: error.status ? error.message : 'Nao foi possivel consultar vinculos.' }, { status: error.status || 500 }); }
}

export async function PATCH(request) {
  const access = await requireUser(); if (access.response) return access.response;
  try {
    const body = await request.json();
    const client = await getTursoClient(), actor = await resolveAuthenticatedIdentity(client, access.user);
    return NextResponse.json(await changeRelationship(client, actor, body?.id, body?.action));
  } catch (error) { return NextResponse.json({ error: error.status ? error.message : 'Nao foi possivel alterar vinculo.' }, { status: error.status || 500 }); }
}
