import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { env } from '../../env';

const queryClient = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(queryClient, { schema });
