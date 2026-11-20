import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const normalizeCpf = value => String(value ?? '').replace(/\D/g, '');
export function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = length => { let sum = 0; for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i); const mod = (sum * 10) % 11; return mod === 10 ? 0 : mod; };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
export const normalizeEmail = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
export const normalizeUsername = value => { const v = String(value ?? '').normalize('NFKC').trim().toLowerCase(); return /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(v) ? v : null; };
export function normalizeBrazilPhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55[1-9][0-9]9?[0-9]{8}$/.test(digits) ? `+${digits}` : null;
}
function keyFromEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ausente.`);
  const key = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error(`${name} deve codificar 32 bytes.`);
  return key;
}
export function protectCpf(value, encryptionKey, lookupKey) {
  const cpf = normalizeCpf(value);
  if (!isValidCpf(cpf)) throw new Error('CPF inválido.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(cpf, 'utf8'), cipher.final()]);
  return { cpfCiphertext: ciphertext.toString('base64'), cpfNonce: nonce.toString('base64'), cpfTag: cipher.getAuthTag().toString('base64'), cpfLookupHmac: createHmac('sha256', lookupKey).update(cpf).digest('hex') };
}
export function revealCpf(record, encryptionKey) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(record.cpfNonce, 'base64'));
  decipher.setAuthTag(Buffer.from(record.cpfTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.cpfCiphertext, 'base64')), decipher.final()]).toString('utf8');
}
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !/[a-z]/i.test(password) || !/\d/.test(password) || !/[^a-z\d]/i.test(password)) throw new Error('Use 12 a 128 caracteres, incluindo letra, número e símbolo.');
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${Buffer.from(hash).toString('base64')}`;
}
export async function verifyPassword(password, encoded) {
  const [, n, salt, expected] = String(encoded).split('$');
  if (n !== '16384' || !salt || !expected) return false;
  const actual = Buffer.from(await scrypt(password, Buffer.from(salt, 'base64'), 64, { N: 16384, r: 8, p: 1 }));
  const target = Buffer.from(expected, 'base64');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
export async function createIdentity(client, input, { encryptionKey = keyFromEnv('IDENTITY_ENCRYPTION_KEY'), lookupKey = keyFromEnv('CPF_LOOKUP_HMAC_KEY') } = {}) {
  const username = normalizeUsername(input.username), email = normalizeEmail(input.email), phone = normalizeBrazilPhone(input.phone);
  if (!username) throw new Error('Nome de usuário inválido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  if (!phone) throw new Error('Telefone celular brasileiro inválido.');
  const role = input.role;
  if (!['PERSONAL', 'ALUNO'].includes(role)) throw new Error('Perfil não permitido no cadastro público.');
  const mode = role === 'ALUNO' ? input.studentMode : null;
  if (role === 'ALUNO' && !['INDEPENDENT', 'LINKED'].includes(mode)) throw new Error('Modalidade do aluno inválida.');
  const passwordHash = await hashPassword(input.password);
  const cpf = protectCpf(input.cpf, encryptionKey, lookupKey);
  const id = randomUUID(), now = new Date().toISOString();
  const tx = await client.transaction('write');
  try {
    await tx.execute({ sql: `INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [id, role, mode, username, String(input.fullName).trim(), email, phone, cpf.cpfCiphertext, cpf.cpfNonce, cpf.cpfTag, cpf.cpfLookupHmac, now, now] });
    await tx.execute({ sql: 'INSERT INTO identity_credentials(user_id,password_hash,password_updated_at) VALUES(?,?,?)', args: [id, passwordHash, now] });
    await tx.execute({ sql: 'INSERT INTO identity_security_events(id,subject_id,event_type,created_at) VALUES(?,?,?,?)', args: [randomUUID(), id, 'IDENTITY_CREATED_PENDING_VERIFICATION', now] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  return { id, role, studentMode: mode, status: 'PENDING' };
}
