import { defineMiddleware } from 'astro:middleware';
import { validateSession, SESSION_COOKIE_NAME } from './server/auth/session';
import { canAdmin, canCreateOrEdit } from './server/auth/permissions';

export const onRequest = defineMiddleware(async (context, next) => {
  const token = context.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const { session, user } = await validateSession(token);
    if (session && user) {
      context.locals.user = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        email: user.email,
      };
      context.locals.session = session;
    }
  }

  const { pathname } = context.url;

  // Rutas públicas que no requieren autenticación
  const isPublicRoute =
    pathname === '/login' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/_astro/') ||
    pathname === '/favicon.svg';

  // Si no está autenticado y la ruta no es pública, redirigir a login
  if (!context.locals.user && !isPublicRoute) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/login');
  }

  // Si ya está autenticado e intenta acceder a /login, redirigir a /consultas
  if (context.locals.user && pathname === '/login') {
    return context.redirect('/consultas');
  }

  // Control de acceso por rol (RBAC)
  if (context.locals.user) {
    const role = context.locals.user.role;

    // Rutas de administración
    if (pathname.startsWith('/admin') && !canAdmin(role)) {
      return context.redirect('/consultas');
    }

    // Rutas de anexado / edición de documentos
    if (pathname.startsWith('/anexar') && !canCreateOrEdit(role)) {
      return context.redirect('/consultas');
    }
  }

  return next();
});
