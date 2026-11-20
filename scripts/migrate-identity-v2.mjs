import 'dotenv/config';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';

const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url?.startsWith('file:')) {
  console.error('Migração bloqueada: Identity V2 só pode ser aplicada por este script a um banco libSQL local file:.');
  process.exitCode = 1;
} else {
  const client = createClient({ url });
  try {
    const result = await migrateIdentitySchema(client);
    console.log(`${result.applied ? 'Aplicada' : 'Já aplicada'}: ${result.migration} (${url})`);
  } finally {
    await client.close();
  }
}
