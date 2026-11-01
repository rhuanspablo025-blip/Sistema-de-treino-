const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const DATE_TAG = '__turso_date_milliseconds__';

function encodeValue(value) {
  if (value instanceof Date) return { [DATE_TAG]: value.getTime() };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === DATE_TAG) return new Date(value[DATE_TAG]);
  return Object.fromEntries(keys.map((key) => [key, decodeValue(value[key])]));
}

function encodeDocument(document) { return JSON.stringify(encodeValue(document)); }
function decodeDocument(value) { return decodeValue(JSON.parse(value)); }

function pathValues(value, pathParts) {
  if (!pathParts.length) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => pathValues(item, pathParts));
  if (value == null || typeof value !== 'object' || !(pathParts[0] in value)) return [MISSING];
  return pathValues(value[pathParts[0]], pathParts.slice(1));
}

const MISSING = Symbol('missing');

function valuesAt(document, path) { return pathValues(document, String(path).split('.')); }
function getPath(document, path) { return valuesAt(document, path)[0]; }

function setPath(target, path, value) {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object' || Array.isArray(node[part])) node[part] = {};
    node = node[part];
  }
  node[parts[parts.length - 1]] = value;
}

function unsetPath(target, path) {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!node || typeof node !== 'object') return;
    node = node[part];
  }
  if (node && typeof node === 'object') delete node[parts[parts.length - 1]];
}

function compare(left, right) {
  if (left instanceof Date) left = left.getTime();
  if (right instanceof Date) right = right.getTime();
  if (left === right) return 0;
  if (left == null || right == null) return left == null ? -1 : 1;
  return left < right ? -1 : 1;
}

function scalarMatches(actual, expected) {
  if (actual === MISSING) return expected == null;
  if (Array.isArray(actual)) return actual.some((item) => scalarMatches(item, expected));
  return isDeepStrictEqual(actual, expected);
}

function conditionMatches(values, condition) {
  const expected = condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date) ? condition : null;
  if (!expected || !Object.keys(expected).some((key) => key.startsWith('$'))) return values.some((value) => scalarMatches(value, condition));

  return Object.entries(expected).every(([operator, operand]) => {
    if (operator === '$options') return true;
    if (operator === '$eq') return values.some((value) => scalarMatches(value, operand));
    if (operator === '$ne') return !values.some((value) => scalarMatches(value, operand));
    if (operator === '$in') return Array.isArray(operand) && values.some((value) => operand.some((candidate) => scalarMatches(value, candidate)));
    if (operator === '$nin') return Array.isArray(operand) && !values.some((value) => operand.some((candidate) => scalarMatches(value, candidate)));
    if (operator === '$exists') return values.some((value) => value !== MISSING) === Boolean(operand);
    if (operator === '$type') return values.some((value) => operand === 'date' ? value instanceof Date : operand === 'string' ? typeof value === 'string' : operand === 'number' ? typeof value === 'number' : operand === 'bool' ? typeof value === 'boolean' : false);
    if (operator === '$gt') return values.some((value) => value !== MISSING && compare(value, operand) > 0);
    if (operator === '$gte') return values.some((value) => value !== MISSING && compare(value, operand) >= 0);
    if (operator === '$lt') return values.some((value) => value !== MISSING && compare(value, operand) < 0);
    if (operator === '$lte') return values.some((value) => value !== MISSING && compare(value, operand) <= 0);
    if (operator === '$regex') {
      const regex = operand instanceof RegExp ? operand : new RegExp(String(operand), expected.$options || '');
      return values.some((value) => typeof value === 'string' && regex.test(value));
    }
    if (operator === '$elemMatch') return values.some((value) => Array.isArray(value) && value.some((item) => matches(item, operand)));
    if (operator === '$size') return values.some((value) => Array.isArray(value) && value.length === operand);
    if (operator === '$not') return !conditionMatches(values, operand);
    throw new Error(`Turso store: operador de consulta não implementado: ${operator}`);
  });
}

function matches(document, query = {}) {
  return Object.entries(query || {}).every(([path, condition]) => {
    if (path === '$or') return Array.isArray(condition) && condition.some((item) => matches(document, item));
    if (path === '$and') return Array.isArray(condition) && condition.every((item) => matches(document, item));
    if (path === '$nor') return Array.isArray(condition) && !condition.some((item) => matches(document, item));
    return conditionMatches(valuesAt(document, path), condition);
  });
}

function clone(value) {
  if (value === MISSING) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

function applyUpdate(document, update, inserting = false) {
  if (!Object.keys(update || {}).some((key) => key.startsWith('$'))) return { ...clone(update), _id: document._id };
  const result = clone(document);
  for (const [operator, fields] of Object.entries(update)) {
    if (operator === '$set' || operator === '$setOnInsert') {
      if (operator === '$setOnInsert' && !inserting) continue;
      for (const [path, value] of Object.entries(fields)) setPath(result, path, clone(value));
    } else if (operator === '$unset') {
      for (const path of Object.keys(fields)) unsetPath(result, path);
    } else if (operator === '$inc') {
      for (const [path, amount] of Object.entries(fields)) {
        const current = getPath(result, path);
        setPath(result, path, (current === MISSING ? 0 : Number(current)) + Number(amount));
      }
    } else if (operator === '$push' || operator === '$addToSet') {
      for (const [path, rawValue] of Object.entries(fields)) {
        const current = getPath(result, path);
        const array = current === MISSING ? [] : Array.isArray(current) ? [...current] : null;
        if (!array) throw new Error(`Turso store: ${path} não é um array.`);
        const values = rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.$each) ? rawValue.$each : [rawValue];
        for (const value of values) {
          if (operator === '$push' || !array.some((item) => isDeepStrictEqual(item, value))) array.push(clone(value));
        }
        const slice = rawValue?.$slice;
        if (operator === '$push' && Number.isInteger(slice)) {
          if (slice >= 0) array.splice(slice);
          else array.splice(0, Math.max(0, array.length + slice));
        }
        setPath(result, path, array);
      }
    } else if (operator === '$pull') {
      for (const [path, condition] of Object.entries(fields)) {
        const current = getPath(result, path);
        if (current === MISSING) continue;
        if (!Array.isArray(current)) throw new Error(`Turso store: ${path} não é um array.`);
        const objectCondition = condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date);
        setPath(result, path, current.filter((item) => !(objectCondition ? matches(item, condition) : conditionMatches([item], condition))));
      }
    } else {
      throw new Error(`Turso store: operador de atualização não implementado: ${operator}`);
    }
  }
  return result;
}

function seedFromFilter(filter) {
  const document = {};
  for (const [path, value] of Object.entries(filter || {})) {
    if (path.startsWith('$')) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && Object.keys(value).some((key) => key.startsWith('$'))) continue;
    setPath(document, path, clone(value));
  }
  return document;
}

function applyProjection(document, projection) {
  if (!projection || !Object.keys(projection).length) return document;
  const included = Object.entries(projection).filter(([key, value]) => key !== '_id' && value === 1).map(([key]) => key);
  if (included.length) {
    const result = {};
    for (const path of included) {
      const value = getPath(document, path);
      if (value !== MISSING) setPath(result, path, clone(value));
    }
    if (projection._id !== 0 && document._id !== undefined) result._id = clone(document._id);
    return result;
  }
  const result = clone(document);
  for (const [path, value] of Object.entries(projection)) if (value === 0) unsetPath(result, path);
  return result;
}

function indexName(keys) { return Object.entries(keys).map(([key, direction]) => `${key}_${direction}`).join('_'); }

function getRecordId(document) {
  const value = document.id ?? document._id;
  if (value == null) return randomUUID();
  return typeof value === 'string' ? value : typeof value.toHexString === 'function' ? value.toHexString() : String(value);
}

class TursoCursor {
  constructor(values, projection) { this.values = Promise.resolve(values); this.projection = projection; this.maximum = Infinity; this.position = 0; this.sortSpecification = null; }
  sort(specification = {}) {
    this.sortSpecification = specification;
    return this;
  }
  limit(value) { this.maximum = Math.max(0, Number(value)); return this; }
  async resolvedValues() {
    const values = [...await this.values];
    const fields = Object.entries(this.sortSpecification || {});
    if (fields.length) values.sort((left, right) => {
      for (const [path, direction] of fields) {
        const result = compare(getPath(left, path), getPath(right, path));
        if (result) return result * (direction < 0 ? -1 : 1);
      }
      return 0;
    });
    return values;
  }
  async toArray() { return (await this.resolvedValues()).slice(0, this.maximum).map((value) => applyProjection(clone(value), this.projection)); }
  async hasNext() { return this.position < Math.min((await this.resolvedValues()).length, this.maximum); }
  async next() {
    if (!(await this.hasNext())) return null;
    const value = (await this.resolvedValues())[this.position++];
    return applyProjection(clone(value), this.projection);
  }
}

class TursoCollection {
  constructor(database, name) { this.database = database; this.name = name; }
  async all(executor = this.database.client) {
    const result = await executor.execute({ sql: 'SELECT document FROM turso_documents WHERE collection = ?', args: [this.name] });
    return result.rows.map((row) => decodeDocument(row.document));
  }
  find(filter = {}, options = {}) { return new TursoCursor(this.database.allForCollection(this.name, filter, options.session), options.projection); }
  async findOne(filter = {}, options = {}) {
    let cursor = new TursoCursor(await this.database.allForCollection(this.name, filter, options.session), options.projection);
    if (options.sort) cursor = cursor.sort(options.sort);
    cursor.limit(1);
    const values = await cursor.toArray();
    return values[0] || null;
  }
  async countDocuments(filter = {}, options = {}) { return (await this.database.allForCollection(this.name, filter, options.session)).length; }
  async insertOne(document, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const value = clone(document);
      const recordId = getRecordId(value);
      if (value._id === undefined) value._id = recordId;
      await this.database.assertUnique(this.name, value, recordId, executor);
      await executor.execute({ sql: 'INSERT INTO turso_documents(collection, id, document) VALUES (?, ?, ?)', args: [this.name, recordId, encodeDocument(value)] });
      return { acknowledged: true, insertedId: value._id };
    });
  }
  async insertMany(documents, options = {}) {
    const insertedIds = {};
    await this.database.write(options.session, async (executor) => {
      for (const [index, document] of documents.entries()) {
        const result = await this.insertOne(document, { session: { transaction: executor } });
        insertedIds[index] = result.insertedId;
      }
    });
    return { acknowledged: true, insertedCount: documents.length, insertedIds };
  }
  async updateOne(filter, update, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const documents = await this.all(executor);
      const existing = documents.find((document) => matches(document, filter));
      if (!existing && !options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      const value = existing ? applyUpdate(existing, update) : applyUpdate(seedFromFilter(filter), update, true);
      const recordId = getRecordId(existing || value);
      if (value._id === undefined) value._id = existing?._id ?? recordId;
      if (!existing && value.id === undefined && value._id == null) value.id = recordId;
      await this.database.assertUnique(this.name, value, recordId, executor);
      if (existing) {
        await executor.execute({ sql: 'UPDATE turso_documents SET document = ? WHERE collection = ? AND id = ?', args: [encodeDocument(value), this.name, recordId] });
        return { acknowledged: true, matchedCount: 1, modifiedCount: isDeepStrictEqual(existing, value) ? 0 : 1, upsertedCount: 0 };
      }
      await executor.execute({ sql: 'INSERT INTO turso_documents(collection, id, document) VALUES (?, ?, ?)', args: [this.name, recordId, encodeDocument(value)] });
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: value._id };
    });
  }
  async updateMany(filter, update, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const documents = await this.all(executor);
      const selected = documents.filter((document) => matches(document, filter));
      for (const existing of selected) {
        const value = applyUpdate(existing, update);
        const recordId = getRecordId(existing);
        await this.database.assertUnique(this.name, value, recordId, executor);
        await executor.execute({ sql: 'UPDATE turso_documents SET document = ? WHERE collection = ? AND id = ?', args: [encodeDocument(value), this.name, recordId] });
      }
      return { acknowledged: true, matchedCount: selected.length, modifiedCount: selected.length };
    });
  }
  async findOneAndUpdate(filter, update, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const existing = (await this.all(executor)).find((document) => matches(document, filter));
      if (!existing && !options.upsert) return null;
      const before = existing || null;
      const value = existing ? applyUpdate(existing, update) : applyUpdate(seedFromFilter(filter), update, true);
      const recordId = getRecordId(existing || value);
      if (value._id === undefined) value._id = existing?._id ?? recordId;
      await this.database.assertUnique(this.name, value, recordId, executor);
      if (existing) await executor.execute({ sql: 'UPDATE turso_documents SET document = ? WHERE collection = ? AND id = ?', args: [encodeDocument(value), this.name, recordId] });
      else await executor.execute({ sql: 'INSERT INTO turso_documents(collection, id, document) VALUES (?, ?, ?)', args: [this.name, recordId, encodeDocument(value)] });
      return applyProjection(clone(options.returnDocument === 'before' ? before || value : value), options.projection);
    });
  }
  async replaceOne(filter, replacement, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const existing = (await this.all(executor)).find((document) => matches(document, filter));
      if (!existing && !options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      const value = { ...clone(replacement), _id: existing?._id ?? replacement._id ?? getRecordId(replacement) };
      const recordId = getRecordId(existing || value);
      await this.database.assertUnique(this.name, value, recordId, executor);
      if (existing) await executor.execute({ sql: 'UPDATE turso_documents SET document = ? WHERE collection = ? AND id = ?', args: [encodeDocument(value), this.name, recordId] });
      else await executor.execute({ sql: 'INSERT INTO turso_documents(collection, id, document) VALUES (?, ?, ?)', args: [this.name, recordId, encodeDocument(value)] });
      return { acknowledged: true, matchedCount: existing ? 1 : 0, modifiedCount: existing ? 1 : 0, upsertedCount: existing ? 0 : 1, upsertedId: existing ? undefined : value._id };
    });
  }
  async deleteOne(filter, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const existing = (await this.all(executor)).find((document) => matches(document, filter));
      if (!existing) return { acknowledged: true, deletedCount: 0 };
      await executor.execute({ sql: 'DELETE FROM turso_documents WHERE collection = ? AND id = ?', args: [this.name, getRecordId(existing)] });
      return { acknowledged: true, deletedCount: 1 };
    });
  }
  async deleteMany(filter, options = {}) {
    return this.database.write(options.session, async (executor) => {
      const documents = (await this.all(executor)).filter((document) => matches(document, filter));
      for (const document of documents) await executor.execute({ sql: 'DELETE FROM turso_documents WHERE collection = ? AND id = ?', args: [this.name, getRecordId(document)] });
      return { acknowledged: true, deletedCount: documents.length };
    });
  }
  async createIndex(keys, options = {}) {
    const name = options.name || indexName(keys);
    if (options.unique) {
      const seen = new Set();
      for (const document of await this.all()) {
        if (options.partialFilterExpression && !matches(document, options.partialFilterExpression)) continue;
        const values = Object.keys(keys).map((path) => getPath(document, path));
        if (options.sparse && values.some((value) => value === MISSING || value == null)) continue;
        const value = encodeDocument(values);
        if (seen.has(value)) { const error = new Error(`Duplicate key for index ${name}`); error.code = 11000; throw error; }
        seen.add(value);
      }
    }
    await this.database.client.execute({ sql: 'INSERT INTO turso_indexes(collection, name, keys, options) VALUES (?, ?, ?, ?) ON CONFLICT(collection, name) DO UPDATE SET keys = excluded.keys, options = excluded.options', args: [this.name, name, JSON.stringify(keys), JSON.stringify(options)] });
    return name;
  }
  listIndexes() {
    const collection = this;
    return { toArray: async () => [{ name: '_id_', key: { _id: 1 } }, ...(await collection.database.readIndexes(collection.name))] };
  }
  async dropIndex(name) {
    const result = await this.database.client.execute({ sql: 'DELETE FROM turso_indexes WHERE collection = ? AND name = ?', args: [this.name, name] });
    if (!result.rowsAffected) { const error = new Error(`Index ${name} not found`); error.code = 27; throw error; }
    return { ok: 1 };
  }
}

class TursoSession {
  constructor(database) { this.database = database; this.transaction = null; }
  async withTransaction(callback) {
    if (this.transaction) throw new Error('Turso session transaction is already active.');
    const transaction = await this.database.client.transaction('write');
    this.transaction = transaction;
    try { const result = await callback(); await transaction.commit(); return result; }
    catch (error) { await transaction.rollback(); throw error; }
    finally { this.transaction = null; }
  }
  async endSession() { if (this.transaction) { await this.transaction.rollback(); this.transaction = null; } }
}

class TursoDatabase {
  constructor(client, databaseName) { this.client = client; this.databaseName = databaseName; }
  collection(name) { return new TursoCollection(this, name); }
  async allForCollection(name, filter = {}, session) { return (await this.collection(name).all(session?.transaction || this.client)).filter((document) => matches(document, filter)); }
  async readIndexes(collection) {
    const result = await this.client.execute({ sql: 'SELECT name, keys, options FROM turso_indexes WHERE collection = ?', args: [collection] });
    return result.rows.map((row) => ({ name: row.name, key: JSON.parse(row.keys), ...JSON.parse(row.options) }));
  }
  async assertUnique(collection, candidate, recordId, executor = this.client) {
    const result = await executor.execute({ sql: 'SELECT name, keys, options FROM turso_indexes WHERE collection = ?', args: [collection] });
    if (!result.rows.length) return;
    const documents = await this.collection(collection).all(executor);
    for (const row of result.rows) {
      const options = JSON.parse(row.options);
      if (!options.unique || (options.partialFilterExpression && !matches(candidate, options.partialFilterExpression))) continue;
      const keys = JSON.parse(row.keys);
      const candidateValues = Object.keys(keys).map((path) => getPath(candidate, path));
      if (options.sparse && candidateValues.some((value) => value === MISSING || value == null)) continue;
      for (const document of documents) {
        if (getRecordId(document) === recordId || (options.partialFilterExpression && !matches(document, options.partialFilterExpression))) continue;
        const otherValues = Object.keys(keys).map((path) => getPath(document, path));
        if (options.sparse && otherValues.some((value) => value === MISSING || value == null)) continue;
        if (isDeepStrictEqual(candidateValues, otherValues)) { const error = new Error(`Duplicate key for index ${row.name}`); error.code = 11000; throw error; }
      }
    }
  }
  async write(session, callback) {
    if (session?.transaction) return callback(session.transaction);
    const transaction = await this.client.transaction('write');
    try { const result = await callback(transaction); await transaction.commit(); return result; }
    catch (error) { await transaction.rollback(); throw error; }
  }
  async createCollection(name) {
    const result = await this.client.execute({ sql: 'INSERT OR IGNORE INTO turso_collections(name) VALUES (?)', args: [name] });
    return { collectionName: name, acknowledged: true, created: result.rowsAffected > 0 };
  }
  listCollections(filter = {}) {
    const database = this;
    return { hasNext: async () => (await database.listCollectionNames(filter)).length > 0, toArray: async () => (await database.listCollectionNames(filter)).map((name) => ({ name, type: 'collection' })) };
  }
  async listCollectionNames(filter = {}) {
    const result = await this.client.execute('SELECT name FROM turso_collections ORDER BY name');
    const names = result.rows.map((row) => row.name);
    return filter.name ? names.filter((name) => name === filter.name) : names;
  }
  async command(command) { if (command?.ping === 1) { await this.client.execute('SELECT 1'); return { ok: 1 }; } throw new Error('Turso store: comando administrativo não suportado.'); }
  startSession() { return new TursoSession(this); }
}

async function initializeSchema(client) {
  await client.batch([
    'CREATE TABLE IF NOT EXISTS turso_collections (name TEXT PRIMARY KEY)',
    'CREATE TABLE IF NOT EXISTS turso_documents (collection TEXT NOT NULL, id TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)), PRIMARY KEY(collection, id))',
    'CREATE TABLE IF NOT EXISTS turso_indexes (collection TEXT NOT NULL, name TEXT NOT NULL, keys TEXT NOT NULL, options TEXT NOT NULL, PRIMARY KEY(collection, name))',
    'CREATE TABLE IF NOT EXISTS turso_migrations (migration_key TEXT PRIMARY KEY, completed_at TEXT NOT NULL, counts TEXT NOT NULL)',
  ], 'write');
}

function databaseNameFromUrl(url) {
  try { return new URL(url).hostname.split('.')[0] || 'main'; }
  catch { return url.startsWith('file:') ? 'local' : 'turso'; }
}

function createTursoDatabase(client, url) {
  return new TursoDatabase(client, databaseNameFromUrl(url));
}

module.exports = { createTursoDatabase, initializeSchema, matches, encodeDocument, decodeDocument, getRecordId };