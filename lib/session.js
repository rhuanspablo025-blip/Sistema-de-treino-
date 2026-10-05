import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'atlas_session';
export const SESSION_DURATION = 60 * 60 * 24 * 7;

async function getSecret() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não configurada.');
  const input = new TextEncoder().encode(`atlas-training-session-v1:${uri}`);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
}

export async function createSession(user) {
  return new SignJWT({ role: user.role, sessionVersion: user.sessionVersion || 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(await getSecret());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await getSecret());
    return payload;
  } catch {
    return null;
  }
}
