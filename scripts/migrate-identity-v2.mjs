import 'dotenv/config';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import { migrateIdentityRelationshipsSchema, migrateIdentityInviteDeliverySchema, migrateIdentityInviteResendSchema, migrateIdentityRelationshipAuditSchema } from '../lib/identity-relationships-schema.mjs';

const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url?.startsWith('file:')) {
  console.error('Migração bloqueada: Identity V2 só pode ser aplicada por este script a um banco libSQL local file:.');
  process.exitCode = 1;
} else {
  const client = createClient({ url });
  try {
    const result = await migrateIdentitySchema(client);
    console.log(`${result.applied ? 'Aplicada' : 'Já aplicada'}: ${result.migration} (${url})`);
    const relationships = await migrateIdentityRelationshipsSchema(client);
    const inviteDelivery = await migrateIdentityInviteDeliverySchema(client);
    console.log(inviteDelivery);
    const resend = await migrateIdentityInviteResendSchema(client);
    console.log(resend);
    const audit = await migrateIdentityRelationshipAuditSchema(client);
    console.log(audit);
    console.log(`${relationships.applied ? 'Aplicada' : 'Já aplicada'}: ${relationships.migration} (${url})`);
  } finally {
    await client.close();
  }
}
