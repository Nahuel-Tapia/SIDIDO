import type { APIRoute } from 'astro';
import { db } from '../../../server/db/client';
import { auditLogs, users } from '../../../server/db/schema';
import { canAdmin } from '../../../server/auth/permissions';
import { desc, eq, and, sql } from 'drizzle-orm';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || !canAdmin(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso restringido a administradores' }), { status: 403 });
  }

  const action = url.searchParams.get('action') || undefined;
  const entityType = url.searchParams.get('entityType') || undefined;
  const exportCsv = url.searchParams.get('format') === 'csv';
  const limit = exportCsv ? 1000 : Math.min(200, Number(url.searchParams.get('limit') || 100));

  const conditions: any[] = [];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (entityType) conditions.push(eq(auditLogs.entityType, entityType));

  const query = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
      userName: users.fullName,
      userUsername: users.username,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  const logs = await query;

  if (exportCsv) {
    const headers = 'ID,Fecha,Usuario,Accion,Entidad,ID Entidad,IP,Detalles\n';
    const rows = logs.map((l) => {
      const detailsClean = l.details ? JSON.stringify(l.details).replace(/"/g, '""') : '';
      return `${l.id},"${l.createdAt.toISOString()}","${l.userUsername || 'Sistema'}","${l.action}","${l.entityType}","${l.entityId || ''}","${l.ipAddress || ''}","${detailsClean}"`;
    }).join('\n');

    return new Response(headers + rows, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="auditoria_sidido.csv"',
      },
    });
  }

  return new Response(JSON.stringify(logs), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
