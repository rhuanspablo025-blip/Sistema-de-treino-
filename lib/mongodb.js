import { createClient } from '@libsql/client';
import { initializeDatabase, domainCollections } from './models.js';
import tursoStore from './turso-document-store.cjs';

const { createTursoDatabase, initializeSchema } = tursoStore;
const DOMAIN_NAMES = Object.keys(domainCollections);
const DOMAIN_ENV = Object.fromEntries(DOMAIN_NAMES.map((domain) => [domain, 'TURSO_DATABASE_URL']));
export { DOMAIN_ENV };

export const COLLECTION_DOMAIN = Object.fromEntries(
  Object.entries(domainCollections).flatMap(([domain, names]) => names.map((name) => [name, domain])),
);

const globalForTurso = globalThis;

function tursoConfig() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url) throw new Error('TURSO_DATABASE_URL não configurada.');
  if (!url.startsWith('file:') && !authToken) throw new Error('TURSO_AUTH_TOKEN não configurado.');
  return { url, authToken };
}

async function getInitializedDatabase() {
  const { url, authToken } = tursoConfig();
  const configKey = `${url}\u0000${authToken || ''}`;
  let state = globalForTurso.tursoDatabaseState;
  if (!state || state.configKey !== configKey) {
    const client = createClient({ url, ...(authToken && { authToken }) });
    state = { configKey, client, database: createTursoDatabase(client, url), initialization: null };
    globalForTurso.tursoDatabaseState = state;
  }
  if (!state.initialization) {
    state.initialization = (async () => {
      await initializeSchema(state.client);
      for (const domain of DOMAIN_NAMES) await initializeDatabase(state.database, domain);
    })().catch((error) => {
      state.initialization = null;
      throw error;
    });
  }
  await state.initialization;
  return state.database;
}

export async function getDatabase(domain) {
  if (domain && !domainCollections[domain]) throw new Error(`Domínio de dados desconhecido: ${domain}`);
  return getInitializedDatabase();
}

export async function getMongoClient(domain = 'accounts') {
  return getDatabase(domain);
}