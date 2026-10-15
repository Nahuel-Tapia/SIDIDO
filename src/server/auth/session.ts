import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';
import type { AstroCookies } from 'astro';

export const SESSION_COOKIE_NAME = 'sidido_session';
const SESSION_EXPIRY_DAYS = 7;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string, ipAddress?: string, userAgent?: string) {
  // Token aleatorio seguro de 32 bytes
  const token = randomBytes(32).toString('hex');
  const sessionId = hashToken(token);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    ipAddress,
    userAgent,
  });

  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const sessionId = hashToken(token);

  const result = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (result.length === 0) {
    return { session: null, user: null };
  }

  const { session, user } = result[0];

  // Chequeo de expiración
  if (Date.now() >= session.expiresAt.getTime() || !user.active) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return { session: null, user: null };
  }

  return { session, user };
}

export async function invalidateSession(token: string) {
  const sessionId = hashToken(token);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function setSessionCookie(cookies: AstroCookies, token: string, expiresAt: Date) {
  cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

export function deleteSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
  });
}
