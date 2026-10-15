import type { APIRoute } from 'astro';
import { getDocumentById, updateDocument, softDeleteDocument, getDocumentRevisions } from '../../../../server/services/documents';
import { canCreateOrEdit, canAdmin } from '../../../../server/auth/permissions';
import { logAudit } from '../../../../server/services/audit';

export const GET: APIRoute = async ({ params, locals, clientAddress, request }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  const id = params.id!;
  const doc = await getDocumentById(id);

  if (!doc) {
    return new Response(JSON.stringify({ error: 'Documento no encontrado' }), { status: 404 });
  }

  // Auditar visualización
  await logAudit({
    userId: locals.user.id,
    action: 'doc.view',
    entityType: 'document',
    entityId: id,
    ipAddress: clientAddress,
    userAgent: request.headers.get('user-agent'),
  });

  const revisions = await getDocumentRevisions(id);

  return new Response(JSON.stringify({ document: doc, revisions }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ params, request, locals, clientAddress }) => {
  if (!locals.user || !canCreateOrEdit(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'No autorizado para editar documentos' }), { status: 403 });
  }

  try {
    const id = params.id!;
    const body = await request.json();
    const { typeId, originId, number, year, caratula, extracto, contenido } = body;

    const updated = await updateDocument(id, {
      typeId: Number(typeId),
      originId: originId ? Number(originId) : null,
      number: number ? String(number) : null,
      year: year ? Number(year) : null,
      caratula: caratula ? String(caratula) : null,
      extracto: extracto ? String(extracto) : null,
      contenido: contenido ? String(contenido) : null,
      updatedBy: locals.user.id,
    });

    await logAudit({
      userId: locals.user.id,
      action: 'doc.update',
      entityType: 'document',
      entityId: id,
      ipAddress: clientAddress,
      userAgent: request.headers.get('user-agent'),
      details: { typeId, originId, number, year },
    });

    return new Response(JSON.stringify({ success: true, document: updated }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error al actualizar documento' }), { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ params, request, locals, clientAddress }) => {
  if (!locals.user || !canCreateOrEdit(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'No autorizado para dar de baja documentos' }), { status: 403 });
  }

  try {
    const id = params.id!;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'Baja solicitada por el operador';

    const deleted = await softDeleteDocument(id, locals.user.id, reason);

    await logAudit({
      userId: locals.user.id,
      action: 'doc.delete',
      entityType: 'document',
      entityId: id,
      ipAddress: clientAddress,
      userAgent: request.headers.get('user-agent'),
      details: { reason },
    });

    return new Response(JSON.stringify({ success: true, document: deleted }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error al eliminar documento' }), { status: 400 });
  }
};
