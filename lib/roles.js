export const SUPER_ADMIN_USERNAME = 'rhuanspablo025';

export function isSuperAdmin(user) {
  return user?.role === 'SUPER_ADMIN' && user.username === SUPER_ADMIN_USERNAME;
}

export function isStaffRole(role) {
  return ['admin', 'dev', 'trainer', 'SUPER_ADMIN'].includes(role);
}

export function isAdminRole(role) {
  return ['admin', 'dev', 'SUPER_ADMIN'].includes(role);
}