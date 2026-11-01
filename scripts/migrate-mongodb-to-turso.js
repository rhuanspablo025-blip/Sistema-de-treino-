#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { MongoClient } = require('mongodb');

const sourceEnv = {
  accounts: 'MONGODB_URI_ACCOUNTS',
  exercises: 'MONGODB_URI_EXERCISES',
  training: 'MONGODB_URI_TRAINING',
  finance: 'MONGODB_URI_FINANCE',
};

async function migrate() {
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
  if (!TURSO_DATABASE_URL || (!TURSO_DATABASE_URL.startsWith('file:') && !TURSO_AUTH_TOKEN)) throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN em .env.local.');

  const [{ createClient }, store, models] = await Promise.all([
    import('@libsql/client'),
    import('../lib/turso-document-store.cjs'),
    import('../lib/models.js'),
  ]);
  const targetClient = createClient({ url: TURSO_DATABASE_URL, ...(TURSO_AUTH_TOKEN && { authToken: TURSO_AUTH_TOKEN }) });
  const database = store.default.createTursoDatabase(targetClient, TURSO_DATABASE_URL);
  const { encodeDocument } = store.default;
  const clients = new Map();
  const counts = {};
  const dryRun = process.argv.includes('--dry-run');

  try {
    const migrationKey = 'mongodb-to-turso-v1';
    let targetCount = 0;
    if (dryRun) {
      const schema = await targetClient.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'turso_documents'");
      if (schema.rows.length) {
        const targetRows = await targetClient.execute('SELECT COUNT(*) AS count FROM turso_documents');
        targetCount = Number(targetRows.rows[0].count);
      }
    } else {
      await store.default.initializeSchema(targetClient);
      const completed = await targetClient.execute({ sql: 'SELECT migration_key FROM turso_migrations WHERE migration_key = ?', args: [migrationKey] });
      if (completed.rows.length) {
        console.log(JSON.stringify({ ok: true, mode: 'mongodb-to-turso', skipped: true, reason: 'migration_already_completed' }));
        return;
      }
      const targetRows = await targetClient.execute('SELECT COUNT(*) AS count FROM turso_documents');
      targetCount = Number(targetRows.rows[0].count);
    }
    if (targetCount > 0 && !process.argv.includes('--resume')) {
      throw new Error('O banco Turso já contém dados. Use um banco vazio ou reexecute explicitamente com --resume após validar o estado da migração.');
    }

    const fallbackUri = process.env.MONGODB_URI;
    for (const [domain, collections] of Object.entries(models.domainCollections)) {
      const uri = process.env[sourceEnv[domain]] || fallbackUri;
      if (!uri) throw new Error(`Configure ${sourceEnv[domain]} (ou MONGODB_URI) para importar o domínio ${domain}.`);
      if (!clients.has(uri)) {
        const client = new MongoClient(uri, { maxPoolSize: 4, serverSelectionTimeoutMS: 10000 });
        await client.connect();
        clients.set(uri, client);
      }
      const source = clients.get(uri).db('sistema_treino');
      counts[domain] = {};

      for (const collectionName of collections) {
        const sourceCollection = source.collection(collectionName);
        const cursor = sourceCollection.find({}).batchSize(250);
        let count = 0;
        let statements = [];
        if (!dryRun) await database.createCollection(collectionName);
        for await (const sourceDocument of cursor) {
          const document = { ...sourceDocument };
          if (document._id != null && typeof document._id.toHexString === 'function') document._id = document._id.toHexString();
          if (!document.id && document._id == null) throw new Error(`${collectionName} contém documento sem id e sem _id.`);
          if (!document.id) document.id = String(document._id);
          if (!dryRun) {
            const recordId = String(document.id ?? document._id);
            statements.push({
              sql: 'INSERT INTO turso_documents(collection, id, document) VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET document = excluded.document',
              args: [collectionName, recordId, encodeDocument(document)],
            });
            if (statements.length >= 100) {
              await targetClient.batch(statements, 'write');
              statements = [];
            }
          }
          count += 1;
        }
        if (statements.length) await targetClient.batch(statements, 'write');
        counts[domain][collectionName] = count;
      }
    }

    if (!dryRun) {
      for (const domain of Object.keys(models.domainCollections)) await models.initializeDatabase(database, domain);
      await targetClient.execute({
        sql: 'INSERT INTO turso_migrations(migration_key, completed_at, counts) VALUES (?, ?, ?)',
        args: [migrationKey, new Date().toISOString(), JSON.stringify(counts)],
      });
    }
    console.log(JSON.stringify({ ok: true, mode: dryRun ? 'dry-run' : 'mongodb-to-turso', documents: counts }, null, 2));
  } finally {
    await Promise.all([...clients.values()].map((client) => client.close()));
    await targetClient.close();
  }
}

migrate().catch((error) => {
  console.error(`Migração MongoDB → Turso falhou: ${error.message}`);
  process.exitCode = 1;
});