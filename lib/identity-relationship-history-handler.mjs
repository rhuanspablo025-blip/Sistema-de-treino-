import { resolveAuthenticatedIdentity } from './identity-authorization.mjs';
import { listRelationshipHistory } from './identity-relationships.mjs';

export function createHistoryGetHandler({ requireUserFn, getClient }) {
  if (typeof requireUserFn !== 'function' || typeof getClient !== 'function') {
    throw new TypeError('Dependencias do handler de historico obrigatorias.');
  }

  return async function GET(request, { params }) {
    const access = await requireUserFn();
    if (access.response) return access.response;

    try {
      const client = await getClient();
      const actor = await resolveAuthenticatedIdentity(client, access.user);
      const { relationshipId } = await params;
      const url = new URL(request.url);
      const result = await listRelationshipHistory(
        client,
        actor,
        relationshipId,
        url.searchParams.get('page'),
        url.searchParams.get('pageSize'),
      );
      return Response.json(result);
    } catch (error) {
      return Response.json(
        { error: error.status ? error.message : 'Falha ao consultar historico.' },
        { status: error.status || 500 },
      );
    }
  };
}
