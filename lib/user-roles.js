export function rolesFor(user) {
  return new Set([...(Array.isArray(user?.roles) ? user.roles : []), user?.role].filter(Boolean));
}

export function hasAnyRole(user, roles) {
  const assigned = rolesFor(user);
  return roles.some((role) => assigned.has(role));
}

export function isAdminUser(user) {
  return hasAnyRole(user, ['admin', 'dev', 'SUPER_ADMIN']);
}
