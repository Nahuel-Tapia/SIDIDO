import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../server/db/client';
import { users } from '../../../server/db/schema';
import { verifyPassword } from '../../../server/auth/password';
import { createSession, setSessionCookie } from '../../../server/auth/session';
import { logAudit } from '../../../server/services/audit';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Usuario y contraseña requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const trimmedUser = String(username).trim();
    const userResult = await db.select().from(users).where(eq(users.username, trimmedUser)).limit(1);

    const user = userResult[0];
    const userAgent = request.headers.get('user-agent') || '';

    if (!user || !user.active) {
      await logAudit({
        action: 'login_failed',
        entityType: 'auth',
        entityId: trimmedUser,
        ipAddress: clientAddress,
        userAgent,
        details: { reason: !user ? 'Usuario no encontrado' : 'Usuario inactivo' },
      });

      return new Response(JSON.stringify({ error: 'Credenciales inválidas o usuario inactivo' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      await logAudit({
        userId: user.id,
        action: 'login_failed',
        entityType: 'auth',
        entityId: user.username,
        ipAddress: clientAddress,
        userAgent,
        details: { reason: 'Contraseña incorrecta' },
      });

      return new Response(JSON.stringify({ error: 'Credenciales inválidas' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Login exitoso: crear sesión
    const { token, expiresAt } = await createSession(user.id, clientAddress, userAgent);
    setSessionCookie(cookies, token, expiresAt);

    // Actualizar último login
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    await logAudit({
      userId: user.id,
      action: 'login_success',
      entityType: 'auth',
      entityId: user.username,
      ipAddress: clientAddress,
      userAgent,
    });

    return new Response(JSON.stringify({ success: true, redirect: '/consultas' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Error en login:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
