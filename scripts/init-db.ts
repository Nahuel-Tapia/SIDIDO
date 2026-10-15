import postgres from 'postgres';
import { env } from '../src/env';

async function init() {
  console.log('Connecting to database:', env.DATABASE_URL);
  const sql = postgres(env.DATABASE_URL);

  try {
    console.log('1. Creating extensions...');
    await sql`CREATE EXTENSION IF NOT EXISTS "unaccent";`;
    await sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`;

    console.log('2. Configuring es_unaccent text search configuration...');
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'es_unaccent') THEN
          CREATE TEXT SEARCH CONFIGURATION es_unaccent (COPY = spanish);
          ALTER TEXT SEARCH CONFIGURATION es_unaccent
            ALTER MAPPING FOR hword, hword_part, word
            WITH unaccent, spanish_stem;
        END IF;
      END $$;
    `);

    console.log('Extensions and FTS configuration successfully initialized!');
  } catch (err) {
    console.error('Error initializing extensions:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

init();
