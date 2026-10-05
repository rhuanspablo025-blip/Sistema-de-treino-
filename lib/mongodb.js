import { MongoClient } from 'mongodb';
import { initializeDatabase } from './models';

const DATABASE_NAME = 'sistema_treino';
const globalForMongo = globalThis;
let initializationPromise;

export async function getDatabase() {
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
