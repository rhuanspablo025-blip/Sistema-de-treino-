import { createClient } from '@libsql/client';
import { migrateIdentityReactivationConsentSchema } from '../lib/identity-relationships-schema.mjs';

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN são necessários para aplicar a migração 006.');
}

const client = createClient({ url, authToken });
try {
  const result = await migrateIdentityReactivationConsentSchema(client);
  console.log(`Migração 006 ${result.applied ? 'aplicada' : 'já aplicada'}.`);
} finally {
  await client.close();
}
