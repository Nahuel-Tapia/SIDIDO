import { pgTable, text, timestamp, boolean, uuid, integer, smallint, bigint, jsonb, pgEnum, customType } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Tipo personalizado BYTEA para almacenar binarios de PDFs directamente en PostgreSQL
export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
  toDriver(val: Buffer): Buffer {
    return val;
  },
  fromDriver(val: unknown): Buffer {
    if (Buffer.isBuffer(val)) return val;
    if (val instanceof Uint8Array) return Buffer.from(val);
    if (typeof val === 'string') {
      // Formato hex de Postgres (\x...)
      if (val.startsWith('\\x')) {
        return Buffer.from(val.slice(2), 'hex');
      }
      return Buffer.from(val, 'binary');
    }
    return Buffer.alloc(0);
  },
});

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'operador', 'consulta']);
export const ocrStatusEnum = pgEnum('ocr_status', ['none', 'pending', 'processing', 'completed', 'failed']);
export const revisionActionEnum = pgEnum('revision_action', ['create', 'update', 'delete', 'restore', 'ocr_update', 'file_replace']);

// 1. Usuarios
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').default('consulta').notNull(),
  active: boolean('active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Sesiones
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // SHA-256 del token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Catálogos: Tipos de Documento y Orígenes
export const documentTypes = pgTable('document_types', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull().unique(),
  name: text('name').notNull().unique(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const origins = pgTable('origins', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Almacenamiento Binario de Archivos PDF en Base de Datos (PostgreSQL BYTEA)
export const documentFiles = pgTable('document_files', {
  key: text('key').primaryKey(), // Identificador único (ej: uuid.pdf)
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').default('application/pdf').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  data: bytea('data').notNull(), // Contenido binario completo del PDF en la BD
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 5. Documentos Digitalizados
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  typeId: integer('type_id').notNull().references(() => documentTypes.id),
  originId: integer('origin_id').references(() => origins.id),
  number: text('number'),
  year: smallint('year'),
  expediente: text('expediente'), // Número de expediente oficial (ej: 300-028554-2026)
  caratula: text('caratula'),
  extracto: text('extracto'),
  contenido: text('contenido'),

  // Referencia y Metadatos del Archivo PDF
  fileKey: text('file_key'),
  fileName: text('file_name'),
  fileSize: bigint('file_size', { mode: 'number' }),
  fileSha256: text('file_sha256'),
  pageCount: integer('page_count'),

  // Estado OCR y Metadatos Extraídos Automáticamente (DNI, CUIL, Nombres Asociados, Instituciones, Fecha, Expediente)
  ocrStatus: ocrStatusEnum('ocr_status').default('none').notNull(),
  ocrError: text('ocr_error'),
  ocrCompletedAt: timestamp('ocr_completed_at', { withTimezone: true }),
  extractedMetadata: jsonb('extracted_metadata').$type<{
    expediente?: string | null;
    dnis?: string[];
    cuils?: string[];
    people?: string[];
    institutions?: string[];
    detectedDate?: string | null;
  }>(),

  // Auditoría y ciclo de vida
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

  // Baja lógica
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => users.id),
  deleteReason: text('delete_reason'),
});

// 6. Historial de Cambios / Revisiones
export const documentRevisions = pgTable('document_revisions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  action: revisionActionEnum('action').notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
  snapshot: jsonb('snapshot').notNull(),
  diff: jsonb('diff'),
});

// 7. Registro de Auditoría
export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 8. Migraciones e Importaciones
export const importRuns = pgTable('import_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source').notNull(),
  totalRecords: integer('total_records').default(0).notNull(),
  importedCount: integer('imported_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  skippedCount: integer('skipped_count').default(0).notNull(),
  status: text('status').notNull(),
  reportPath: text('report_path'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const importErrors = pgTable('import_errors', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: uuid('run_id').notNull().references(() => importRuns.id, { onDelete: 'cascade' }),
  rowIndex: integer('row_index'),
  identifier: text('identifier'),
  errorMessage: text('error_message').notNull(),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relaciones Drizzle
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  createdDocuments: many(documents, { relationName: 'doc_created_by' }),
  auditLogs: many(auditLogs),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  type: one(documentTypes, {
    fields: [documents.typeId],
    references: [documentTypes.id],
  }),
  origin: one(origins, {
    fields: [documents.originId],
    references: [origins.id],
  }),
  creator: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
    relationName: 'doc_created_by'
  }),
  revisions: many(documentRevisions),
}));

export const documentRevisionsRelations = relations(documentRevisions, ({ one }) => ({
  document: one(documents, {
    fields: [documentRevisions.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [documentRevisions.changedBy],
    references: [users.id],
  }),
}));
