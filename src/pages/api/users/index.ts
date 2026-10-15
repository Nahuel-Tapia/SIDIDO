import type { APIRoute } from 'astro';
import { db } from '../../../server/db/client';
import { users } from '../../../server/db/schema';
import { hashPassword } from '../../../server/auth/password';
import { canAdmin } from '../../../server/auth/permissions';
import { logAudit } from '../../../server/services/audit';
import { desc, eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || !canAdmin(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso restringido a administradores' }), { status: 403 });
  }

  const list = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return new Response(JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user || !canAdmin(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso restringido a administradores' }), { status: 403 });
  }

  try {
    const { username, fullName, email, password, role } = await request.json();

    if (!username || !fullName || !password || !role) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const [created] = await db
      .insert(users)
      .values({
        username: String(username).trim().toLowerCase(),
        fullName: String(fullName).trim(),
        email: email ? String(email).trim().toLowerCase() : null,
        passwordHash,
        role,
        active: true,
      })
      .returning();

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user_create',
      entityType: 'user',
      entityId: created.id,
      ipAddress: clientAddress,
      details: { username, role },
    });

    return new Response(JSON.stringify({ success: true, user: created }), { status: 201 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error al crear usuario' }), { status: 400 });
  }
};

export const PATCH: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user || !canAdmin(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso restringido a administradores' }), { status: 403 });
  }

  try {
    const { id, active, password, role } = await request.json();
    const updateData: any = { updatedAt: new Date() };

    if (active !== undefined) updateData.active = Boolean(active);
    if (role) updateData.role = role;
    if (password) updateData.passwordHash = await hashPassword(password);

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user_update',
      entityType: 'user',
      entityId: id,
      ipAddress: clientAddress,
      details: { active, role, passwordChanged: Boolean(password) },
    });

    return new Response(JSON.stringify({ success: true, user: updated }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error al actualizar usuario' }), { status: 400 });
  }
};
