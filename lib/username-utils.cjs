const { randomUUID } = require('node:crypto');

function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(username)) return null;
  return username;
}

async function migrateLegacyUsernames(database) {
  const users = database.collection('users');
  let indexes = [];
  try {
    indexes = await users.listIndexes().toArray();
  } catch (error) {
    if (error.code !== 26) throw error;
  }

  for (const indexName of ['email_1', 'usernameKey_1']) {
    if (!indexes.some((index) => index.name === indexName)) continue;
    try {
      await users.dropIndex(indexName);
    } catch (error) {
      if (error.code !== 27 && error.code !== 26) throw error;
    }
  }

  const existingUsers = await users.find({}, { projection: { id: 1, username: 1, usernameKey: 1, email: 1 } }).sort({ id: 1, _id: 1 }).toArray();
  const usedUsernames = new Set();
  for (const user of existingUsers) {
    const emailUsername = typeof user.email === 'string' ? user.email.split('@')[0] : '';
    const candidates = [user.username, user.usernameKey, emailUsername].map(normalizeUsername).filter(Boolean);
    let username = candidates.find((candidate) => !usedUsernames.has(candidate));
    if (!username) {
      const suffix = String(user.id || user._id).replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase() || randomUUID().slice(0, 12);
      username = `usuario-${suffix}`;
      let sequence = 1;
      while (usedUsernames.has(username)) username = `usuario-${suffix}-${sequence++}`;
      console.warn(`Username de migração atribuído à conta ${user.id || user._id}: ${username}`);
    }
    usedUsernames.add(username);
    if (user.username !== username || user.usernameKey !== undefined || user.email !== undefined) {
      await users.updateOne({ _id: user._id }, { $set: { username }, $unset: { usernameKey: '', email: '' } });
    }
  }
}

async function ensureUniqueUserIndexes(users) {
  await users.createIndex({ username: 1 }, { unique: true });
  await users.createIndex({ id: 1 }, { unique: true });
}

module.exports = { normalizeUsername, migrateLegacyUsernames, ensureUniqueUserIndexes };