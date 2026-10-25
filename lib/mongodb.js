import { MongoClient } from 'mongodb';
import { initializeDatabase, domainCollections } from './models.js';

// Nome do banco dentro de cada cluster (um cluster por domínio).
const DATABASE_NAME = 'sistema_treino';

// Domínio -> variável de ambiente com a URI do cluster daquele domínio.
export const DOMAIN_ENV = {
  accounts: 'MONGODB_URI_ACCOUNTS',
  exercises: 'MONGODB_URI_EXERCISES',
  training: 'MONGODB_URI_TRAINING',
  finance: 'MONGODB_URI_FINANCE',
};

// Coleção -> domínio: define em qual cluster cada coleção vive.
// Derivado de `domainCollections` para manter uma única fonte de verdade.
export const COLLECTION_DOMAIN = Object.fromEntries(
  Object.entries(domainCollections).flatMap(([domain, names]) => names.map((name) => [name, domain])),
);

const globalForMongo = globalThis;
const initializationByDomain = {};

// Resolve a URI do domínio; sem variável específica, usa MONGODB_URI (modo atual).
function resolveUri(domain) {
  const envKey = DOMAIN_ENV[domain] || DOMAIN_ENV.accounts;
  const uri = process.env[envKey] || process.env.MONGODB_URI;
  if (!uri) throw new Error(`MONGODB_URI não configurada (nem ${envKey}).`);
  return uri;
}

// Reaproveita o mesmo cliente quando domínios diferentes apontam para a mesma URI.
async function connectClient(uri) {
  const cache = (globalForMongo.mongoClients ||= new Map());
  if (!cache.has(uri)) {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    cache.set(uri, client.connect().catch((error) => {
      cache.delete(uri);
      throw error;
    }));
  }
  return cache.get(uri);
}

async function ensureDomain(domain) {
  const client = await connectClient(resolveUri(domain));
  const database = client.db(DATABASE_NAME);
  if (!initializationByDomain[domain]) {
    initializationByDomain[domain] = initializeDatabase(database, domain).catch((error) => {
      initializationByDomain[domain] = undefined;
      throw error;
    });
  }
  await initializationByDomain[domain];
  return database;
}

// Com domínio explícito devolve o banco daquele cluster.
// Sem domínio devolve um despachante que encaminha cada coleção ao cluster correto,
// preservando o uso atual (`database.collection('...')`) em todo o código.
// Cada cluster é resolvido de forma independente: se um domínio estiver indisponível,
// somente as operações daquele domínio falham.
export async function getDatabase(domain) {
  if (domain) return ensureDomain(domain);

  const domains = Object.keys(DOMAIN_ENV);
  const settled = await Promise.allSettled(domains.map((name) => ensureDomain(name)));
  const byDomain = {};
  const failures = {};
  domains.forEach((name, index) => {
    if (settled[index].status === 'fulfilled') byDomain[name] = settled[index].value;
    else failures[name] = settled[index].reason;
  });
  const databaseFor = (name) => {
    const target = COLLECTION_DOMAIN[name] || 'accounts';
    if (failures[target]) throw failures[target];
    return byDomain[target];
  };

  return {
    collection: (name) => databaseFor(name).collection(name),
    // Comandos administrativos (ex.: ping) são executados no cluster de cadastros.
    command: (command) => databaseFor('users').command(command),
    get databaseName() { return databaseFor('users').databaseName; },
  };
}

// Cliente do cluster de um domínio (necessário para transações, que valem dentro de um cluster).
export async function getMongoClient(domain = 'accounts') {
  const safeDomain = DOMAIN_ENV[domain] ? domain : 'accounts';
  return connectClient(resolveUri(safeDomain));
}
