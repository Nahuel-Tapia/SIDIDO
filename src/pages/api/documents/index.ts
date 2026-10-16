import type { APIRoute } from 'astro';
import { searchDocuments } from '../../../server/services/search';
import { createDocument } from '../../../server/services/documents';
import { canCreateOrEdit } from '../../../server/auth/permissions';
import { logAudit } from '../../../server/services/audit';
import { processDocumentOcr } from '../../../server/services/ocr';

export const GET: APIRoute = async ({ url, locals, clientAddress, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const q = url.searchParams.get('q') || undefined;
  const typeId = url.searchParams.get('typeId') ? Number(url.searchParams.get('typeId')) : undefined;
  const originId = url.searchParams.get('originId') ? Number(url.searchParams.get('originId')) : undefined;
  const number = url.searchParams.get('number') || undefined;
  const year = url.searchParams.get('year') ? Number(url.searchParams.get('year')) : undefined;
  const expediente = url.searchParams.get('expediente') || undefined;
  const dni = url.searchParams.get('dni') || undefined;
  const persona = url.searchParams.get('persona') || undefined;
  const caratula = url.searchParams.get('caratula') || undefined;
  const extracto = url.searchParams.get('extracto') || undefined;
  const contenido = url.searchParams.get('contenido') || undefined;
  const orderBy = (url.searchParams.get('orderBy') as any) || 'date_desc';
  const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
  const pageSize = url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 15;

  const result = await searchDocuments({
    q,
    typeId,
    originId,
    number,
    year,
    expediente,
    dni,
    persona,
    caratula,
    extracto,
    contenido,
    orderBy,
    page,
    pageSize,
  });

  // Registrar auditoría de búsqueda si se usó algún filtro
  if (q || typeId || originId || number || year || expediente || dni || persona || caratula || extracto || contenido) {
    await logAudit({
      userId: locals.user.id,
      action: 'doc.search',
      entityType: 'document',
      ipAddress: clientAddress,
      userAgent: request.headers.get('user-agent'),
      details: { q, typeId, originId, number, year, expediente, dni, persona, caratula, totalFound: result.total },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user || !canCreateOrEdit(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'No autorizado para crear documentos' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { typeId, originId, number, year, expediente, caratula, extracto, contenido, fileKey, fileName, fileSize, fileSha256, pageCount, extractedMetadata } = body;

    if (!typeId) {
      return new Response(JSON.stringify({ error: 'El Tipo de Documento es obligatorio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const doc = await createDocument({
      typeId: Number(typeId),
      originId: originId ? Number(originId) : null,
      number: number ? String(number) : null,
      year: year ? Number(year) : null,
      expediente: expediente ? String(expediente) : null,
      caratula: caratula ? String(caratula) : null,
      extracto: extracto ? String(extracto) : null,
      contenido: contenido ? String(contenido) : null,
      fileKey: fileKey || null,
      fileName: fileName || null,
      fileSize: fileSize ? Number(fileSize) : null,
      fileSha256: fileSha256 || null,
      pageCount: pageCount ? Number(pageCount) : null,
      extractedMetadata: extractedMetadata || null,
      ocrStatus: fileKey ? 'pending' : 'none',
      createdBy: locals.user.id,
    });

    // Auditar creación
    await logAudit({
      userId: locals.user.id,
      action: 'doc.create',
      entityType: 'document',
      entityId: doc.id,
      ipAddress: clientAddress,
      userAgent: request.headers.get('user-agent'),
      details: { typeId, originId, number, year },
    });

    // Si tiene archivo y no se proveyó contenido manual completo, disparar OCR asíncrono
    if (fileKey) {
      setTimeout(() => {
        processDocumentOcr(doc.id).catch((err) => console.error('Error en OCR asíncrono:', err));
      }, 50);
    }

    return new Response(JSON.stringify({ success: true, document: doc }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Error al crear documento:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Error al guardar el documento' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
