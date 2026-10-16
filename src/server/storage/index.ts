import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { env } from '../../env';
import { db } from '../db/client';
import { documentFiles } from '../db/schema';

export interface SaveFileMetadata {
  fileName?: string;
  mimeType?: string;
  sha256?: string;
  uploadedBy?: string | null;
}

export interface StorageDriver {
  save(key: string, data: Buffer | Uint8Array, meta?: SaveFileMetadata): Promise<string>;
  getStream(key: string): NodeJS.ReadableStream | null;
  getBuffer(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

/**
 * Almacenamiento Híbrido con Persistencia Principal en Base de Datos PostgreSQL (tabla document_files)
 * y caché rápida en disco local. Garantiza que todos los PDFs cargados vivan dentro de la BD.
 */
class DatabaseBackedStorage implements StorageDriver {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  private async ensureDir() {
    if (!existsSync(this.baseDir)) {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(key: string) {
    const safeKey = path.basename(key);
    return path.join(this.baseDir, safeKey);
  }

  async save(key: string, data: Buffer | Uint8Array, meta?: SaveFileMetadata): Promise<string> {
    const safeKey = path.basename(key);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const sha256 = meta?.sha256 || createHash('sha256').update(buffer).digest('hex');
    const fileName = meta?.fileName || safeKey;
    const mimeType = meta?.mimeType || 'application/pdf';

    // 1. Persistir binario directamente en PostgreSQL (tabla document_files)
    await db
      .insert(documentFiles)
      .values({
        key: safeKey,
        fileName,
        mimeType,
        fileSize: buffer.byteLength,
        sha256,
        data: buffer,
        uploadedBy: meta?.uploadedBy || null,
      })
      .onConflictDoUpdate({
        target: documentFiles.key,
        set: {
          fileName,
          mimeType,
          fileSize: buffer.byteLength,
          sha256,
          data: buffer,
        },
      });

    // 2. Guardar copia en caché de disco local para lecturas directas
    try {
      await this.ensureDir();
      const filePath = this.getFilePath(safeKey);
      await fs.writeFile(filePath, buffer);
    } catch (diskErr) {
      console.warn('No se pudo escribir caché en disco, el PDF permanece seguro en PostgreSQL:', diskErr);
    }

    return safeKey;
  }

  getStream(key: string): NodeJS.ReadableStream | null {
    const filePath = this.getFilePath(key);
    if (!existsSync(filePath)) return null;
    return createReadStream(filePath);
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    const safeKey = path.basename(key);

    // 1. Intentar obtener directamente desde PostgreSQL (fuente de verdad)
    try {
      const rows = await db
        .select({ data: documentFiles.data })
        .from(documentFiles)
        .where(eq(documentFiles.key, safeKey))
        .limit(1);

      if (rows.length > 0 && rows[0].data) {
        return rows[0].data;
      }
    } catch (dbErr) {
      console.warn('Error consultando document_files en BD, intentando disco local:', dbErr);
    }

    // 2. Fallback a disco local (y sincronizar a la BD si existe en disco pero no en BD)
    const filePath = this.getFilePath(safeKey);
    if (existsSync(filePath)) {
      const diskBuffer = await fs.readFile(filePath);
      try {
        await this.save(safeKey, diskBuffer, { fileName: safeKey });
      } catch {
        // Ignorar error de sincronización silenciosa
      }
      return diskBuffer;
    }

    return null;
  }

  async delete(key: string): Promise<boolean> {
    const safeKey = path.basename(key);
    let deleted = false;

    try {
      await db.delete(documentFiles).where(eq(documentFiles.key, safeKey));
      deleted = true;
    } catch (err) {
      console.warn('Error eliminando PDF de document_files:', err);
    }

    const filePath = this.getFilePath(safeKey);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
      deleted = true;
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    const safeKey = path.basename(key);
    const rows = await db
      .select({ key: documentFiles.key })
      .from(documentFiles)
      .where(eq(documentFiles.key, safeKey))
      .limit(1);

    if (rows.length > 0) return true;
    return existsSync(this.getFilePath(safeKey));
  }
}

export const storage: StorageDriver = new DatabaseBackedStorage(env.STORAGE_LOCAL_PATH);
