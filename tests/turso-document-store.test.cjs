const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('@libsql/client');
const { createTursoDatabase, initializeSchema } = require('../lib/turso-document-store.cjs');

test('Turso document adapter preserves filters, projections, dates, indexes, upserts and transactions', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await initializeSchema(client);
    const database = createTursoDatabase(client, 'file::memory:');
    await database.createCollection('users');
    await client.batch([{ sql: 'INSERT INTO turso_documents(collection, id, document) VALUES (?, ?, ?)', args: ['import_test', 'legacy-1', JSON.stringify({ _id: 'legacy-1', id: 'legacy-1', value: 1 })] }], 'write');
    assert.equal((await database.collection('import_test').findOne({ id: 'legacy-1' })).value, 1);
    const users = database.collection('users');
    await users.createIndex({ username: 1 }, { unique: true });
    await users.insertOne({ id: 'user-1', username: 'alice', createdAt: new Date('2026-01-01T00:00:00.000Z') });

    const found = await users.find({ id: { $in: ['user-1'] }, deletedAt: { $exists: false } }, { projection: { username: 1, createdAt: 1 } }).sort({ username: 1 }).toArray();
    assert.equal(found.length, 1);
    assert.equal(found[0].username, 'alice');
    assert.ok(found[0].createdAt instanceof Date);

    await assert.rejects(() => users.insertOne({ id: 'user-2', username: 'alice' }), { code: 11000 });

    const session = database.startSession();
    await session.withTransaction(async () => {
      await users.updateOne({ id: 'user-1' }, { $inc: { loginCount: 1 } }, { session });
      await users.updateOne({ id: 'user-2' }, { $setOnInsert: { username: 'bob', loginCount: 0 } }, { upsert: true, session });
    });
    await session.endSession();

    assert.equal(await users.countDocuments({ username: { $in: ['alice', 'bob'] } }), 2);
    assert.equal((await users.findOne({ id: 'user-1' })).loginCount, 1);
    await users.updateOne({ id: 'user-1' }, { $push: { measurements: { id: 'measurement-1', weight: 80, date: new Date('2026-01-02T00:00:00Z') } } });
    await users.updateOne({ id: 'user-1' }, { $pull: { measurements: { id: 'measurement-1' } } });
    assert.deepEqual((await users.findOne({ id: 'user-1' })).measurements, []);
  } finally {
    await client.close();
  }
});

test('database initialization is idempotent and seeds the exercise catalog only once', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await initializeSchema(client);
    const database = createTursoDatabase(client, 'file::memory:');
    const models = await import('../lib/models.js');
    for (const domain of Object.keys(models.domainCollections)) await models.initializeDatabase(database, domain);
    const firstCount = await database.collection('exercises').countDocuments({});
    assert.ok(firstCount > 0);
    for (const domain of Object.keys(models.domainCollections)) await models.initializeDatabase(database, domain);
    assert.equal(await database.collection('exercises').countDocuments({}), firstCount);
    assert.ok(await database.collection('app_settings').findOne({ id: 'system:exercise-catalog-seed-v1' }));
  } finally {
    await client.close();
  }
});