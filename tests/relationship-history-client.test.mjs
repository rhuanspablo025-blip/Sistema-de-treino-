import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRelationshipHistoryClient,
  presentRelationshipHistoryEvent,
} from '../lib/relationship-history-client.mjs';

const event = (id, created_at, event_type = 'ACCEPTED', next_status = 'ACTIVE') => ({
  id,
  actor_id: 'identity-personal-1',
  event_type,
  created_at,
  previous_status: 'PENDING',
  next_status,
  reason: null,
});

test('authorized history load requests the selected relationship endpoint and returns real event data', async () => {
  const row = event('event-1', '2026-04-01T09:30:00.000Z');
  const calls = [];
  const history = createRelationshipHistoryClient(async (url) => {
    calls.push(url);
    return { events: [row], page: 1, pageSize: 20, total: 1 };
  });
  const result = await history.load('rel / 1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], '/api/identity/relationships/rel%20%2F%201/history?page=1&pageSize=20');
  assert.deepEqual(result.events, [row]);
  assert.equal(result.loaded, true);
});

test('history events are presented with operation, transition, responsible identity and reason', () => {
  const row = { ...event('event-suspend', '2026-04-02T10:00:00.000Z', 'SUSPEND', 'SUSPENDED'), previous_status: 'ACTIVE', reason: 'Pausa solicitada pelo aluno' };
  assert.deepEqual(presentRelationshipHistoryEvent(row), {
    title: 'Vínculo suspenso',
    previousStatus: 'ACTIVE',
    nextStatus: 'SUSPENDED',
    actorId: 'identity-personal-1',
    reason: 'Pausa solicitada pelo aluno',
    createdAt: '2026-04-02T10:00:00.000Z',
  });
});

test('history supports the empty state when the API returns no persisted events', async () => {
  const history = createRelationshipHistoryClient(async () => ({ events: [], page: 1, pageSize: 20, total: 0 }));
  const result = await history.load('relationship-empty');
  assert.deepEqual(result.events, []);
  assert.equal(result.total, 0);
  assert.equal(result.hasMore, false);
});

test('history API errors remain visible to the drawer instead of becoming empty history', async () => {
  const failure = new Error('Acesso negado ao histórico.');
  failure.status = 403;
  const history = createRelationshipHistoryClient(async () => { throw failure; });
  await assert.rejects(history.load('relationship-private'), (error) => error === failure && error.status === 403);
  assert.equal(history.getState('relationship-private').loaded, false);
});

test('history pagination appends ordered pages without duplicate events', async () => {
  const calls = [];
  const pages = {
    1: { events: [event('event-b', '2026-04-02T09:00:00.000Z'), event('event-a', '2026-04-01T09:00:00.000Z')], page: 1, pageSize: 2, total: 3 },
    2: { events: [event('event-b', '2026-04-02T09:00:00.000Z'), event('event-c', '2026-04-03T09:00:00.000Z')], page: 2, pageSize: 2, total: 3 },
  };
  const history = createRelationshipHistoryClient(async (url) => {
    calls.push(url);
    return pages[new URL(url, 'http://atlasfit.local').searchParams.get('page')];
  }, { pageSize: 2 });
  await history.load('relationship-paged');
  const result = await history.loadMore('relationship-paged');
  assert.equal(calls.length, 2);
  assert.deepEqual(result.events.map((item) => item.id), ['event-a', 'event-b', 'event-c']);
  assert.equal(new Set(result.events.map((item) => item.id)).size, 3);
  assert.equal(result.hasMore, false);
});

test('refreshing history after a relationship operation replaces stale events', async () => {
  let revision = 0;
  const history = createRelationshipHistoryClient(async () => {
    revision += 1;
    return revision === 1
      ? { events: [event('event-accepted', '2026-04-01T09:00:00.000Z')], page: 1, pageSize: 20, total: 1 }
      : { events: [event('event-accepted', '2026-04-01T09:00:00.000Z'), event('event-suspended', '2026-04-02T09:00:00.000Z', 'SUSPEND', 'SUSPENDED')], page: 1, pageSize: 20, total: 2 };
  });
  await history.load('relationship-refresh');
  const refreshed = await history.refresh('relationship-refresh');
  assert.deepEqual(refreshed.events.map((item) => item.event_type), ['ACCEPTED', 'SUSPEND']);
  assert.equal(refreshed.total, 2);
});

test('duplicate concurrent history loads share one API request', async () => {
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const history = createRelationshipHistoryClient(async () => {
    calls += 1;
    await pending;
    return { events: [event('event-1', '2026-04-01T09:00:00.000Z')], page: 1, pageSize: 20, total: 1 };
  });
  const first = history.refresh('relationship-once');
  const second = history.refresh('relationship-once');
  assert.equal(calls, 1);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(calls, 1);
});
