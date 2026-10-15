import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/sidido'),
  PORT: z.coerce.number().default(4321),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SESSION_SECRET: z.string().min(16).default('sidido_seguridad_san_juan_gob_secret_2026_key'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage/pdfs'),
  MAX_UPLOAD_MB: z.coerce.number().default(50),
});

export const env = envSchema.parse(process.env);
