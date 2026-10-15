import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, documentTypes, origins, users, documentRevisions } from '../db/schema';

export interface CreateDocumentInput {
  typeId: number;
  originId?: number | null;
  number?: string | null;
  year?: number | null;
  caratula?: string | null;
  extracto?: string | null;
  contenido?: string | null;
  fileKey?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileSha256?: string | null;
  pageCount?: number | null;
  ocrStatus?: 'none' | 'pending' | 'processing' | 'completed' | 'failed';
  createdBy?: string | null;
}

export interface UpdateDocumentInput {
  typeId: number;
  originId?: number | null;
  number?: string | null;
  year?: number | null;
  caratula?: string | null;
  extracto?: string | null;
  contenido?: string | null;
  updatedBy: string;
}

/**
 * Chequea si ya existe un documento activo con la misma combinación (tipo, origen, número, año).
 */
export async function checkDuplicate(
  typeId: number,
  originId?: number | null,
  number?: string | null,
  year?: number | null,
  excludeId?: string
) {
  const normOrigin = originId || null;
  const normNumber = number?.trim() || null;
  const normYear = year || null;

  const conditions = [
    eq(documents.typeId, typeId),
    isNull(documents.deletedAt),
  ];

  if (normOrigin !== null) {
    conditions.push(eq(documents.originId, normOrigin));
  } else {
    conditions.push(isNull(documents.originId));
  }

  if (normNumber !== null) {
    conditions.push(eq(documents.number, normNumber));
  } else {
    conditions.push(isNull(documents.number));
  }

  if (normYear !== null) {
    conditions.push(eq(documents.year, normYear));
  } else {
    conditions.push(isNull(documents.year));
  }

  const result = await db.select().from(documents).where(and(...conditions)).limit(1);

  if (result.length > 0) {
    if (excludeId && result[0].id === excludeId) {
      return false;
    }
    return true;
  }
  return false;
}

export async function createDocument(input: CreateDocumentInput) {
  const isDup = await checkDuplicate(input.typeId, input.originId, input.number, input.year);
  if (isDup) {
    throw new Error('Ya existe un documento activo con el mismo Tipo, Origen, Número y Año.');
  }

  const [doc] = await db
    .insert(documents)
    .values({
      typeId: input.typeId,
      originId: input.originId || null,
      number: input.number?.trim() || null,
      year: input.year || null,
      caratula: input.caratula?.trim() || null,
      extracto: input.extracto?.trim() || null,
      contenido: input.contenido?.trim() || null,
      fileKey: input.fileKey || null,
      fileName: input.fileName || null,
      fileSize: input.fileSize || null,
      fileSha256: input.fileSha256 || null,
      pageCount: input.pageCount || null,
      ocrStatus: input.ocrStatus || 'none',
      createdBy: input.createdBy || null,
      updatedBy: input.createdBy || null,
    })
    .returning();

  // Historial de revisión inicial
  await db.insert(documentRevisions).values({
    documentId: doc.id,
    version: 1,
    action: 'create',
    changedBy: input.createdBy || null,
    snapshot: doc,
    diff: { initial: true },
  });

  return doc;
}

export async function getDocumentById(id: string) {
  const rows = await db
    .select({
      doc: documents,
      typeName: documentTypes.name,
      typeCode: documentTypes.code,
      originName: origins.name,
      originCode: origins.code,
      creatorName: users.fullName,
    })
    .from(documents)
    .innerJoin(documentTypes, eq(documents.typeId, documentTypes.id))
    .leftJoin(origins, eq(documents.originId, origins.id))
    .leftJoin(users, eq(documents.createdBy, users.id))
    .where(eq(documents.id, id))
    .limit(1);

  return rows[0] || null;
}

export async function updateDocument(id: string, input: UpdateDocumentInput) {
  const current = await getDocumentById(id);
  if (!current) throw new Error('Documento no encontrado');

  const isDup = await checkDuplicate(input.typeId, input.originId, input.number, input.year, id);
  if (isDup) {
    throw new Error('Ya existe otro documento activo con el mismo Tipo, Origen, Número y Año.');
  }

  // Obtener última versión
  const lastRev = await db
    .select({ version: documentRevisions.version })
    .from(documentRevisions)
    .where(eq(documentRevisions.documentId, id))
    .orderBy(desc(documentRevisions.version))
    .limit(1);

  const nextVersion = (lastRev[0]?.version || 1) + 1;

  const [updated] = await db
    .update(documents)
    .set({
      typeId: input.typeId,
      originId: input.originId || null,
      number: input.number?.trim() || null,
      year: input.year || null,
      caratula: input.caratula?.trim() || null,
      extracto: input.extracto?.trim() || null,
      contenido: input.contenido?.trim() || null,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning();

  // Guardar snapshot en revisiones
  await db.insert(documentRevisions).values({
    documentId: id,
    version: nextVersion,
    action: 'update',
    changedBy: input.updatedBy,
    snapshot: updated,
    diff: {
      from: current.doc,
      to: updated,
    },
  });

  return updated;
}

export async function softDeleteDocument(id: string, deletedBy: string, reason: string) {
  const [deleted] = await db
    .update(documents)
    .set({
      deletedAt: new Date(),
      deletedBy,
      deleteReason: reason.trim(),
    })
    .where(eq(documents.id, id))
    .returning();

  const lastRev = await db
    .select({ version: documentRevisions.version })
    .from(documentRevisions)
    .where(eq(documentRevisions.documentId, id))
    .orderBy(desc(documentRevisions.version))
    .limit(1);

  await db.insert(documentRevisions).values({
    documentId: id,
    version: (lastRev[0]?.version || 1) + 1,
    action: 'delete',
    changedBy: deletedBy,
    snapshot: deleted,
    diff: { reason },
  });

  return deleted;
}

export async function getDocumentRevisions(documentId: string) {
  return db
    .select({
      rev: documentRevisions,
      userName: users.fullName,
    })
    .from(documentRevisions)
    .leftJoin(users, eq(documentRevisions.changedBy, users.id))
    .where(eq(documentRevisions.documentId, documentId))
    .orderBy(desc(documentRevisions.version));
}
