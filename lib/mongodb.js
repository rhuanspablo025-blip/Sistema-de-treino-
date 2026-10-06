import { MongoClient } from 'mongodb';
import { initializeDatabase } from './models.js';

const DATABASE_NAME = 'sistema_treino';
const globalForMongo = globalThis;
let initializationPromise;

export async function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não configurada.');

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    globalForMongo.mongoClientPromise = client.connect().catch((error) => {
      globalForMongo.mongoClientPromise = undefined;
      throw error;
    });
  }

  const client = await globalForMongo.mongoClientPromise;
  return client;
}

export async function getDatabase() {
  const client = await getMongoClient();
  const database = client.db(DATABASE_NAME);
  if (!initializationPromise) {
    initializationPromise = initializeDatabase(database).catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }
  await initializationPromise;
  return database;
}
