import type { APIRoute } from 'astro';
import { invalidateSession, deleteSessionCookie, SESSION_COOKIE_NAME } from '../../../server/auth/session';
import { logAudit } from '../../../server/services/audit';

export const POST: APIRoute = async ({ cookies, locals, clientAddress, request }) => {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    if (locals.user) {
      await logAudit({
        userId: locals.user.id,
        action: 'logout',
        entityType: 'auth',
        entityId: locals.user.username,
        ipAddress: clientAddress,
        userAgent: request.headers.get('user-agent'),
      });
    }
    await invalidateSession(token);
    deleteSessionCookie(cookies);
  }

  return new Response(JSON.stringify({ success: true, redirect: '/login' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
