import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, documentRevisions } from '../db/schema';
import { storage } from '../storage';
import pdfParse from 'pdf-parse';

export async function processDocumentOcr(documentId: string) {
  try {
    const docResult = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    const doc = docResult[0];

    if (!doc || !doc.fileKey) {
      return { success: false, reason: 'Documento o archivo no encontrado' };
    }

    // Actualizar estado a processing
    await db.update(documents).set({ ocrStatus: 'processing' }).where(eq(documents.id, documentId));

    const buffer = await storage.getBuffer(doc.fileKey);
    if (!buffer) {
      await db.update(documents).set({ ocrStatus: 'failed', ocrError: 'No se pudo leer el archivo físico' }).where(eq(documents.id, documentId));
      return { success: false, reason: 'Archivo no encontrado en storage' };
    }

    let extractedText = '';

    // Paso 1: Extracción digital rápida mediante pdf-parse
    try {
      const parsed = await pdfParse(buffer);
      if (parsed.text && parsed.text.trim().length > 30) {
        extractedText = parsed.text.trim();
        // Guardar recuento de páginas si está disponible
        if (parsed.numpages) {
          await db.update(documents).set({ pageCount: parsed.numpages }).where(eq(documents.id, documentId));
        }
      }
    } catch (parseErr) {
      console.warn('Extracción directa con pdf-parse no concluyente:', parseErr);
    }

    // Paso 2: Si el PDF es un escaneo de imágenes sin texto digital embebido, invocar Tesseract.js
    if (!extractedText || extractedText.length <= 30) {
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('spa');
        const ret = await worker.recognize(buffer);
        extractedText = ret.data.text.trim();
        await worker.terminate();
      } catch (tessErr: any) {
        console.warn('Aviso en procesamiento OCR Tesseract:', tessErr?.message || tessErr);
      }
    }

    // Persistir contenido extraído
    const finalContent = (doc.contenido ? doc.contenido + '\n\n' : '') + extractedText;

    await db.update(documents).set({
      contenido: finalContent.trim(),
      ocrStatus: 'completed',
      ocrError: null,
      ocrCompletedAt: new Date(),
    }).where(eq(documents.id, documentId));

    // Registrar revisión de OCR
    await db.insert(documentRevisions).values({
      documentId,
      version: 99,
      action: 'ocr_update',
      changedBy: null,
      snapshot: { ocrSuccess: true, charsExtracted: extractedText.length },
      diff: { extractedTextSample: extractedText.slice(0, 100) },
    });

    return { success: true, chars: extractedText.length };
  } catch (err: any) {
    console.error('Error procesando OCR del documento:', err);
    await db.update(documents).set({
      ocrStatus: 'failed',
      ocrError: err?.message || 'Error durante el procesamiento OCR',
    }).where(eq(documents.id, documentId));

    return { success: false, error: err?.message };
  }
}
