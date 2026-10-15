import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { documentTypes, origins } from '../db/schema';

export async function getDocumentTypes(onlyActive = true) {
  if (onlyActive) {
    return db.select().from(documentTypes).where(eq(documentTypes.active, true)).orderBy(documentTypes.name);
  }
  return db.select().from(documentTypes).orderBy(desc(documentTypes.createdAt));
}

export async function getOrigins(onlyActive = true) {
  if (onlyActive) {
    return db.select().from(origins).where(eq(origins.active, true)).orderBy(origins.code);
  }
  return db.select().from(origins).orderBy(desc(origins.createdAt));
}

export async function createDocumentType(code: string, name: string) {
  const [created] = await db
    .insert(documentTypes)
    .values({
      code: code.trim().toUpperCase(),
      name: name.trim(),
    })
    .returning();
  return created;
}

export async function createOrigin(code: string, name: string) {
  const [created] = await db
    .insert(origins)
    .values({
      code: code.trim().toUpperCase(),
      name: name.trim(),
    })
    .returning();
  return created;
}

export async function toggleDocumentType(id: number, active: boolean) {
  return db.update(documentTypes).set({ active }).where(eq(documentTypes.id, id));
}

export async function toggleOrigin(id: number, active: boolean) {
  return db.update(origins).set({ active }).where(eq(origins.id, id));
}
