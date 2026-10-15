import type { APIRoute } from 'astro';
import { createHash, randomUUID } from 'node:crypto';
import { storage } from '../../../server/storage';
import { env } from '../../../env';
import { canCreateOrEdit } from '../../../server/auth/permissions';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || !canCreateOrEdit(locals.user.role)) {
    return new Response(JSON.stringify({ error: 'No autorizado para subir archivos' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No se envió ningún archivo' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar formato PDF
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return new Response(JSON.stringify({ error: 'El archivo debe ser un documento PDF' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar tamaño máximo
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return new Response(
        JSON.stringify({ error: `El archivo supera el tamaño máximo permitido de ${env.MAX_UPLOAD_MB} MB` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validar firma mágica de PDF (%PDF-)
    const pdfMagic = buffer.slice(0, 5).toString('ascii');
    if (!pdfMagic.startsWith('%PDF-')) {
      return new Response(JSON.stringify({ error: 'El archivo no tiene una cabecera PDF válida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Calcular hash SHA-256
    const fileSha256 = createHash('sha256').update(buffer).digest('hex');

    // Generar clave única de archivo
    const fileKey = `${randomUUID()}.pdf`;

    // Guardar en la capa de almacenamiento
    await storage.save(fileKey, buffer);

    return new Response(
      JSON.stringify({
        success: true,
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        fileSha256,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error al subir archivo:', err);
    return new Response(JSON.stringify({ error: 'Error procesando la carga del archivo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
