const allowedActions = {
  ACTIVE: ['SUSPEND', 'TERMINATE'],
  SUSPENDED: ['REACTIVATE', 'TERMINATE'],
};

export function getRelationshipActions(status) {
  return allowedActions[status] || [];
}

export async function runRelationshipAction({ relationship, action, request, refresh, onUpdate, onBusy }) {
  if (!relationship?.id || !getRelationshipActions(relationship.status).includes(action)) {
    throw new Error('Ação indisponível para o estado atual do vínculo.');
  }
  onBusy?.(true);
  try {
    const result = await request('/api/identity/relationships', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: relationship.id, action }),
    });
    onUpdate?.(result);
    await refresh?.();
    return result;
  } finally {
    onBusy?.(false);
  }
}
