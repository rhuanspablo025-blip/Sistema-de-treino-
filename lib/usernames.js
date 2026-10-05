export function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return null;
  return username;
}
