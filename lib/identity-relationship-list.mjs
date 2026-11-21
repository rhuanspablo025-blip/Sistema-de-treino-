import { IdentityAccessError } from './identity-authorization.mjs';
export async function listStudentRelationships(client, actor, pageValue = '1') {
  if (actor?.role !== 'ALUNO' || !actor.id) throw new IdentityAccessError('Acesso negado.', 403);
  const raw=String(pageValue||'1'); if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>100000)throw new IdentityAccessError('Paginacao invalida.',400);
  const page=Number(raw),limit=25,offset=(page-1)*limit;
  const [rows,count]=await Promise.all([
    client.execute({sql:`SELECT r.id,r.status,r.created_at,r.updated_at,r.accepted_at,p.id AS personal_id,p.full_name AS personal_name,(SELECT rr.id FROM identity_relationship_reactivation_requests rr WHERE rr.relationship_id=r.id AND rr.status='PENDING' LIMIT 1) AS reactivation_request_id,(SELECT rr.requested_at FROM identity_relationship_reactivation_requests rr WHERE rr.relationship_id=r.id AND rr.status='PENDING' LIMIT 1) AS reactivation_requested_at FROM identity_relationships r JOIN identity_users p ON p.id=r.personal_id WHERE r.student_id=? ORDER BY r.created_at DESC,r.id ASC LIMIT ? OFFSET ?`,args:[actor.id,limit,offset]}),
    client.execute({sql:'SELECT COUNT(*) AS total FROM identity_relationships WHERE student_id=?',args:[actor.id]})
  ]);
  return {relationships:rows.rows,page,total:Number(count.rows[0].total)};
}
