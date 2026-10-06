const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureUniqueUserIndexes, migrateLegacyUsernames, normalizeUsername } = require('../lib/username-utils.cjs');

function createDatabase(documents, indexNames) {
  const indexCalls = [];
  const users = {
    listIndexes: () => ({ toArray: async () => indexNames.map((name) => ({ name })) }),
    dropIndex: async (name) => { indexNames.splice(indexNames.indexOf(name), 1); },
    find: () => ({ sort: () => ({ toArray: async () => documents.map((document) => ({ ...document })) }) }),
    updateOne: async ({ _id }, update) => {
      const document = documents.find((item) => item._id === _id);
      Object.assign(document, update.$set);
      for (const key of Object.keys(update.$unset)) delete document[key];
    },
    createIndex: async (keys, options) => indexCalls.push({ keys, options }),
  };
  return { collection: () => users, users, documents, indexCalls };
}

test('normalizes usernames consistently and rejects invalid values', () => {
  assert.equal(normalizeUsername('  Rhuan_01  '), 'rhuan_01');
  assert.equal(normalizeUsername('Ｒｈｕａｎ'), 'rhuan');
  assert.equal(normalizeUsername('ab'), null);
  assert.equal(normalizeUsername('rhuan user'), null);
  assert.equal(normalizeUsername('rhuan@example.com'), null);
  assert.equal(normalizeUsername('a'.repeat(30)), 'a'.repeat(30));
  assert.equal(normalizeUsername('a'.repeat(31)), null);
});

test('migrates legacy usernames deterministically and creates unique indexes', async () => {
  const documents = [
    { _id: 'one', id: '00000000-0000-0000-0000-000000000001', usernameKey: 'rhuan', email: 'rhuan@example.com' },
    { _id: 'two', id: '00000000-0000-0000-0000-000000000002', email: 'RHUAN@another.example' },
    { _id: 'three', id: '00000000-0000-0000-0000-000000000003', username: 'Legacy_User', usernameKey: 'legacy_user', email: 'old@example.com' },
  ];
  const database = createDatabase(documents, ['_id_', 'email_1', 'usernameKey_1']);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    await migrateLegacyUsernames(database);
    await migrateLegacyUsernames(database);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(documents.map(({ username }) => username), ['rhuan', 'usuario-000000000002', 'legacy_user']);
  assert.ok(documents.every((document) => !('email' in document) && !('usernameKey' in document)));
  assert.equal(warnings.length, 1);

  await ensureUniqueUserIndexes(database.users);
  assert.deepEqual(database.indexCalls, [
    { keys: { username: 1 }, options: { unique: true } },
    { keys: { id: 1 }, options: { unique: true } },
  ]);
});