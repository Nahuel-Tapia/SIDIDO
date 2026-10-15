import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { desc, eq } from 'drizzle-orm';

export interface AuditParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, any> | null;
}

export async function logAudit(params: AuditParams) {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      details: params.details || null,
    });
  } catch (err) {
    console.error('Error logging audit event:', err);
  }
}

export async function getRecentAuditLogs(limit = 100, offset = 0) {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);
}
