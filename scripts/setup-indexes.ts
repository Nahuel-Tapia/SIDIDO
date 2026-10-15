import postgres from 'postgres';
import { env } from '../src/env';

async function setupIndexes() {
  const sql = postgres(env.DATABASE_URL);

  try {
    console.log('Adding generated column search_vector and indexes...');

    // Verificar si search_vector ya existe
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'documents' AND column_name = 'search_vector'
        ) THEN
          ALTER TABLE documents ADD COLUMN search_vector tsvector 
          GENERATED ALWAYS AS (
            setweight(to_tsvector('es_unaccent', coalesce(caratula, '')), 'A') ||
            setweight(to_tsvector('es_unaccent', coalesce(extracto, '')), 'B') ||
            setweight(to_tsvector('es_unaccent', coalesce(contenido, '')), 'C')
          ) STORED;
        END IF;
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

    // Índices de búsqueda FTS y trigramas
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING GIN (search_vector);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_caratula_trgm ON documents USING GIN (caratula gin_trgm_ops);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_number_trgm ON documents USING GIN (number gin_trgm_ops);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_filters ON documents (type_id, year, origin_id) WHERE deleted_at IS NULL;`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC) WHERE deleted_at IS NULL;`);

    console.log('Indexes and generated column search_vector configured successfully!');
  } catch (err) {
    console.error('Error configuring indexes:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

setupIndexes();
