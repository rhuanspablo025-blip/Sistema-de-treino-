import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { getTursoClient } from '../../../../lib/mongodb';
import { resolveAuthenticatedIdentity } from '../../../../lib/identity-authorization.mjs';
import { changeRelationship, contractedCapacity } from '../../../../lib/identity-relationships.mjs';
import { listStudentRelationships } from '../../../../lib/identity-relationship-list.mjs';

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
      const order = { name: 'u.full_name COLLATE NOCASE ASC', oldest: 'r.created_at ASC', newest: 'r.created_at DESC' }[params.get('sort')] || 'r.created_at DESC';
      const [result, count, metrics, capacity, training] = await Promise.all([
        client.execute({ sql: `SELECT r.id,r.status,r.created_at,r.updated_at,r.accepted_at,u.id AS student_id,u.full_name,u.username,u.status AS account_status,(SELECT rr.id FROM identity_relationship_reactivation_requests rr WHERE rr.relationship_id=r.id AND rr.status='PENDING' LIMIT 1) AS reactivation_request_id FROM identity_relationships r JOIN identity_users u ON u.id=r.student_id WHERE ${where} ORDER BY ${order} LIMIT 25 OFFSET ?`, args: [...args, (page - 1) * 25] }),
        client.execute({ sql: `SELECT COUNT(*) AS total FROM identity_relationships r JOIN identity_users u ON u.id=r.student_id WHERE ${where}`, args }),
        client.execute({ sql: `SELECT SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status IN ('ACTIVE','SUSPENDED') THEN 1 ELSE 0 END) AS occupied FROM identity_relationships WHERE personal_id=?`, args: [actor.id] }),
        contractedCapacity(client, actor.id),
        client.execute({ sql: `SELECT COUNT(*) AS plans,COUNT(DISTINCT json_extract(p.document,'$.studentId')) AS covered FROM turso_documents p JOIN identity_relationships r ON r.student_id=json_extract(p.document,'$.studentId') WHERE p.collection='workout_plans' AND r.personal_id=? AND r.status='ACTIVE' AND json_extract(p.document,'$.trainerId')=? AND json_extract(p.document,'$.active')=1 AND json_extract(p.document,'$.deletedAt') IS NULL`, args: [actor.id, actor.id] }),
      ]);
      if (id && !result.rows.length) return NextResponse.json({ error: 'Aluno indisponível.' }, { status: 404 });
      const active = Number(metrics.rows[0].active || 0);
      return NextResponse.json({ relationships: result.rows, page, total: Number(count.rows[0].total), active, occupied: Number(metrics.rows[0].occupied || 0), capacity, activePlans: Number(training.rows[0].plans || 0), withoutPlan: Math.max(0, active - Number(training.rows[0].covered || 0)) });
    }
    if (actor.role === 'ALUNO') {
      return NextResponse.json(await listStudentRelationships(client, actor, params.get('page') || '1'));
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
