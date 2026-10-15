export type Role = 'admin' | 'operador' | 'consulta';

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  if (userRole === 'admin') return true;
  if (userRole === 'operador' && (requiredRole === 'operador' || requiredRole === 'consulta')) return true;
  if (userRole === 'consulta' && requiredRole === 'consulta') return true;
  return false;
}

export function canCreateOrEdit(userRole?: Role): boolean {
  return userRole === 'admin' || userRole === 'operador';
}

export function canAdmin(userRole?: Role): boolean {
  return userRole === 'admin';
}
