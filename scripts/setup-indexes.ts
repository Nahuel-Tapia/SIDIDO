import postgres from 'postgres';
import { env } from '../src/env';

async function setupIndexes() {
  const sql = postgres(env.DATABASE_URL);

  try {
    console.log('1. Asegurando tabla document_files (BYTEA) para almacenamiento de PDFs en BD...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS document_files (
        key TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/pdf',
        file_size BIGINT NOT NULL,
        sha256 TEXT NOT NULL,
        data BYTEA NOT NULL,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_document_files_sha256 ON document_files(sha256);
    `);

    console.log('2. Asegurando columnas expediente, extracted_metadata (JSONB) y search_vector e índices FTS...');
    await sql.unsafe(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS expediente TEXT;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_metadata JSONB DEFAULT '{}'::jsonb;
    `);

    await sql.unsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'documents' AND column_name = 'search_vector'
        ) THEN
          ALTER TABLE documents DROP COLUMN search_vector;
        END IF;

        ALTER TABLE documents ADD COLUMN search_vector tsvector 
        GENERATED ALWAYS AS (
          setweight(to_tsvector('es_unaccent', coalesce(expediente, '')), 'A') ||
          setweight(to_tsvector('es_unaccent', coalesce(caratula, '')), 'A') ||
          setweight(to_tsvector('es_unaccent', coalesce(extracto, '')), 'B') ||
          setweight(to_tsvector('es_unaccent', coalesce(extracted_metadata::text, '')), 'B') ||
          setweight(to_tsvector('es_unaccent', coalesce(contenido, '')), 'C')
        ) STORED;
      END $$;
    `);

    // Índice único para evitar duplicados en documentos activos
    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_identity ON documents (
        type_id,
        coalesce(origin_id, 0),
        coalesce(number, ''),
        coalesce(year, 0)
      ) WHERE deleted_at IS NULL;
    `);

    // Índices de búsqueda FTS, trigramas, JSONB y claves de archivo
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING GIN (search_vector);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_extracted_metadata ON documents USING GIN (extracted_metadata);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_expediente_trgm ON documents USING GIN (expediente gin_trgm_ops);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_caratula_trgm ON documents USING GIN (caratula gin_trgm_ops);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_number_trgm ON documents USING GIN (number gin_trgm_ops);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_filters ON documents (type_id, year, origin_id) WHERE deleted_at IS NULL;`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC) WHERE deleted_at IS NULL;`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_file_key ON documents (file_key) WHERE deleted_at IS NULL;`);

    console.log('✓ Tabla document_files, expediente, extracted_metadata, columna search_vector e índices configurados correctamente.');
  } catch (err) {
    console.error('Error configuring indexes:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

setupIndexes();
