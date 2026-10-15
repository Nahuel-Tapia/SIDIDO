import type { APIRoute } from 'astro';
import { invalidateSession, deleteSessionCookie, SESSION_COOKIE_NAME } from '../server/auth/session';

export const ALL: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await invalidateSession(token);
    deleteSessionCookie(cookies);
  }
  return redirect('/login');
};
