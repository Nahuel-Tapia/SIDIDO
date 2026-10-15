import type { APIRoute } from 'astro';
import { getDocumentTypes, createDocumentType, toggleDocumentType } from '../../../server/services/catalog';
import { canAdmin } from '../../../server/auth/permissions';
import { logAudit } from '../../../server/services/audit';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  const all = url.searchParams.get('all') === '1';
  const types = await getDocumentTypes(!all);
  return new Response(JSON.stringify(types), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user || !canAdmin(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso restringido a administradores' }), { status: 403 });
  }

  try {
    const { code, name } = await request.json();
    if (!code || !name) {
      return new Response(JSON.stringify({ error: 'Código y Nombre son requeridos' }), { status: 400 });
    }

    const created = await createDocumentType(code, name);

    await logAudit({
      userId: locals.user.id,
      action: 'admin.type_create',
      entityType: 'catalog',
      entityId: String(created.id),
      ipAddress: clientAddress,
      details: { code, name },
    });

    return new Response(JSON.stringify(created), { status: 201 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error al crear tipo de documento' }), { status: 400 });
  }
};

export const PATCH: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user || !canAdmin(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso restringido a administradores' }), { status: 403 });
  }

  try {
    const { id, active } = await request.json();
    await toggleDocumentType(Number(id), Boolean(active));

    await logAudit({
      userId: locals.user.id,
      action: 'admin.type_toggle',
      entityType: 'catalog',
      entityId: String(id),
      ipAddress: clientAddress,
      details: { active },
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error al actualizar tipo' }), { status: 400 });
  }
};
