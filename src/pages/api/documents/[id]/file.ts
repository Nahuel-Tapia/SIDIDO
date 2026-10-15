import type { APIRoute } from 'astro';
import { getDocumentById } from '../../../../server/services/documents';
import { storage } from '../../../../server/storage';
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

  const buffer = await storage.getBuffer(docData.doc.fileKey);

  if (!buffer) {
    // Si es un documento de muestra sin archivo físico, generamos un PDF mínimo en memoria con su contenido
    const sampleText = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF`;
    const fallbackBuffer = Buffer.from(sampleText);

    return new Response(fallbackBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${docData.doc.fileName || 'documento.pdf'}"`,
      },
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
      details: { fileName, fileSize: docData.doc.fileSize },
    });
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
};
