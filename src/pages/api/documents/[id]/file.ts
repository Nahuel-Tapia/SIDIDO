import type { APIRoute } from 'astro';
import { getDocumentById } from '../../../../server/services/documents';
import { storage } from '../../../../server/storage';
import { generateOfficialPdfBuffer } from '../../../../server/storage/pdf-generator';
import { logAudit } from '../../../../server/services/audit';

export const GET: APIRoute = async ({ params, url, locals, clientAddress, request }) => {
  if (!locals.user) {
    return new Response('No autorizado', { status: 401 });
  }

  const id = params.id!;
  const docData = await getDocumentById(id);

  if (!docData || !docData.doc.fileKey) {
    return new Response('Archivo no disponible', { status: 404 });
  }

  let buffer = await storage.getBuffer(docData.doc.fileKey);

  // Si aún no existe el binario en document_files, generamos y persistimos el PDF oficial en la BD
  if (!buffer) {
    buffer = generateOfficialPdfBuffer({
      typeName: docData.typeName,
      originName: docData.originName ? `${docData.originName} (${docData.originCode})` : null,
      number: docData.doc.number,
      year: docData.doc.year,
      caratula: docData.doc.caratula,
      extracto: docData.doc.extracto,
      contenido: docData.doc.contenido,
    });

    await storage.save(docData.doc.fileKey, buffer, {
      fileName: docData.doc.fileName || `${docData.typeCode}_${docData.doc.number || id}.pdf`,
      uploadedBy: docData.doc.createdBy,
    });
  }

  const isDownload = url.searchParams.get('download') === '1';
  const fileName = docData.doc.fileName || `doc_${docData.doc.number || id}.pdf`;

  // Registrar auditoría de descarga si aplica
  if (isDownload) {
    await logAudit({
      userId: locals.user.id,
      action: 'doc.download',
      entityType: 'document',
      entityId: id,
      ipAddress: clientAddress,
      userAgent: request.headers.get('user-agent'),
      details: { fileName, fileSize: buffer.byteLength },
    });
  }

  const safeAsciiName = fileName.replace(/["\r\n\\]/g, '_').replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(fileName).replace(/['()]/g, escape);
  const contentDisposition = `${isDownload ? 'attachment' : 'inline'}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'private, max-age=300',
    },
  });
};
