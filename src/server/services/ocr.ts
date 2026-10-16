import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, documentRevisions } from '../db/schema';
import { storage } from '../storage';
import { analyzePdfBufferAndFilename } from './extractor';

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
      await db.update(documents).set({ ocrStatus: 'failed', ocrError: 'No se pudo leer el archivo PDF desde la base de datos' }).where(eq(documents.id, documentId));
      return { success: false, reason: 'Archivo no encontrado en document_files' };
    }

    // Paso 1: Análisis automático integral del PDF (texto + DNI + CUIL + Nombres Asociados + Instituciones)
    const analysis = await analyzePdfBufferAndFilename(buffer, doc.fileName || 'documento.pdf');
    let extractedText = analysis.rawText;

    // Paso 2: Si el PDF es un escaneo de imágenes sin texto digital embebido, invocar Tesseract.js en español
    if (!extractedText || extractedText.length <= 20) {
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

    // Combinar metadatos existentes con los detectados en el PDF
    const currentMeta = doc.extractedMetadata || {};
    const mergedMeta = {
      expediente: currentMeta.expediente || analysis.expediente || null,
      dnis: Array.from(new Set([...(currentMeta.dnis || []), ...(analysis.metadata.dnis || [])])),
      cuils: Array.from(new Set([...(currentMeta.cuils || []), ...(analysis.metadata.cuils || [])])),
      people: Array.from(new Set([...(currentMeta.people || []), ...(analysis.metadata.people || [])])),
      institutions: Array.from(new Set([...(currentMeta.institutions || []), ...(analysis.metadata.institutions || [])])),
      detectedDate: currentMeta.detectedDate || analysis.metadata.detectedDate || null,
    };

    const finalContent = doc.contenido?.trim()
      ? doc.contenido.trim()
      : extractedText;

    await db.update(documents).set({
      contenido: finalContent || doc.caratula || '',
      pageCount: analysis.pageCount || doc.pageCount || 1,
      expediente: doc.expediente || analysis.expediente || null,
      extractedMetadata: mergedMeta,
      ocrStatus: 'completed',
      ocrError: null,
      ocrCompletedAt: new Date(),
    }).where(eq(documents.id, documentId));

    // Obtener última versión de revisión para incrementar correlativamente
    const lastRev = await db
      .select({ version: documentRevisions.version })
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, documentId))
      .orderBy(desc(documentRevisions.version))
      .limit(1);

    const nextVersion = (lastRev[0]?.version || 1) + 1;

    await db.insert(documentRevisions).values({
      documentId,
      version: nextVersion,
      action: 'ocr_update',
      changedBy: null,
      snapshot: { ocrSuccess: true, charsExtracted: extractedText.length, extractedMetadata: mergedMeta },
      diff: { extractedTextSample: extractedText.slice(0, 140), entitiesDetected: mergedMeta },
    });

    return { success: true, chars: extractedText.length, metadata: mergedMeta };
  } catch (err: any) {
    console.error('Error procesando OCR del documento:', err);
    await db.update(documents).set({
      ocrStatus: 'failed',
      ocrError: err?.message || 'Error durante el procesamiento OCR',
    }).where(eq(documents.id, documentId));

    return { success: false, error: err?.message };
  }
}
