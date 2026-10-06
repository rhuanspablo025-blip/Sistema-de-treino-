import { createHash } from 'node:crypto';
import { getDatabase } from './mongodb';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function rateKey(username, ipAddress, windowStart) {
  return createHash('sha256').update(`${username}\0${ipAddress}\0${windowStart}`).digest('hex');
}

export async function checkLoginRateLimit(username, ipAddress, now = Date.now()) {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const key = rateKey(username, ipAddress, windowStart);
  const attempt = await (await getDatabase()).collection('auth_attempts').findOne({ key });
  return { key, limited: (attempt?.attempts || 0) >= MAX_FAILURES, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000)) };
}

export async function recordLoginFailure(key, now = Date.now()) {
  const windowEnd = Math.floor(now / WINDOW_MS) * WINDOW_MS + WINDOW_MS;
  await (await getDatabase()).collection('auth_attempts').updateOne(
    { key },
    { $inc: { attempts: 1 }, $setOnInsert: { key, expiresAt: new Date(windowEnd), createdAt: new Date(now) } },
    { upsert: true },
  );
}

export async function clearLoginFailures(key) {
  await (await getDatabase()).collection('auth_attempts').deleteOne({ key });
}