export const RELATIONSHIP_HISTORY_PAGE_SIZE = 20;

const emptyState = () => ({ events: [], page: 0, pageSize: RELATIONSHIP_HISTORY_PAGE_SIZE, total: 0, hasMore: false, loaded: false });
const eventTime = (event) => String(event.created_at || '');
const compareEvents = (left, right) => eventTime(left).localeCompare(eventTime(right)) || String(left.id).localeCompare(String(right.id));

export function mergeRelationshipHistoryEvents(...pages) {
  const eventsById = new Map();
  for (const event of pages.flat()) if (event?.id) eventsById.set(event.id, event);
  return [...eventsById.values()].sort(compareEvents);
}

export function presentRelationshipHistoryEvent(event) {
  const operationLabels = {
    ACCEPTED: 'Convite aceito',
    REJECTED: 'Convite rejeitado',
    SUSPEND: 'Vínculo suspenso',
    REACTIVATE: 'Vínculo reativado',
    TERMINATE: 'Vínculo encerrado',
    REACTIVATION_REQUESTED: 'Reativação solicitada ao aluno',
    REACTIVATION_REJECTED: 'Reativação rejeitada pelo aluno',
  };
  return {
    title: operationLabels[event.event_type] || 'Alteração do vínculo',
    previousStatus: event.previous_status || null,
    nextStatus: event.next_status || null,
    actorId: event.actor_id || null,
    reason: event.reason || null,
    createdAt: event.created_at,
  };
}

export function createRelationshipHistoryClient(request, { pageSize = RELATIONSHIP_HISTORY_PAGE_SIZE } = {}) {
  if (typeof request !== 'function') throw new TypeError('Requisição do histórico obrigatória.');
  const states = new Map();
  const requests = new Map();

  function getState(relationshipId) {
    const state = states.get(relationshipId);
    return state ? { ...state, events: [...state.events] } : emptyState();
  }

  async function fetchPage(relationshipId, page) {
    const key = `${relationshipId}:${page}`;
    if (requests.has(key)) return requests.get(key);
    const promise = (async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const result = await request(`/api/identity/relationships/${encodeURIComponent(relationshipId)}/history?${params}`);
      if (!Array.isArray(result?.events)) throw new Error('Resposta de histórico inválida.');
      return result;
    })();
    requests.set(key, promise);
    try { return await promise; }
    finally { requests.delete(key); }
  }

  async function load(relationshipId, { refresh = false } = {}) {
    if (!relationshipId) throw new Error('Relacionamento não informado.');
    const current = states.get(relationshipId);
    if (current?.loaded && !refresh) return getState(relationshipId);
    const result = await fetchPage(relationshipId, 1);
    const events = mergeRelationshipHistoryEvents(result.events);
    const state = {
      events,
      page: Number(result.page) || 1,
      pageSize: Number(result.pageSize) || pageSize,
      total: Number(result.total) || 0,
      hasMore: events.length < (Number(result.total) || 0),
      loaded: true,
    };
    states.set(relationshipId, state);
    return getState(relationshipId);
  }

  async function loadMore(relationshipId) {
    const current = states.get(relationshipId);
    if (!current?.loaded) return load(relationshipId);
    if (!current.hasMore) return getState(relationshipId);
    const nextPage = current.page + 1;
    const result = await fetchPage(relationshipId, nextPage);
    const events = mergeRelationshipHistoryEvents(current.events, result.events);
    const state = {
      events,
      page: Number(result.page) || nextPage,
      pageSize: Number(result.pageSize) || pageSize,
      total: Number(result.total) || current.total,
      hasMore: events.length < (Number(result.total) || current.total),
      loaded: true,
    };
    states.set(relationshipId, state);
    return getState(relationshipId);
  }

  return {
    load,
    refresh: (relationshipId) => load(relationshipId, { refresh: true }),
    loadMore,
    getState,
  };
}
