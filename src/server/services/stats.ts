import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export async function getDashboardStats() {
  // 1. Totales generales
  const totalsQuery = await db.execute(sql`
    SELECT 
      COUNT(*)::int AS total_docs,
      COUNT(CASE WHEN ocr_status = 'completed' THEN 1 END)::int AS ocr_completed,
      COUNT(CASE WHEN ocr_status IN ('pending', 'processing') THEN 1 END)::int AS ocr_pending,
      COUNT(CASE WHEN created_at >= date_trunc('month', now()) THEN 1 END)::int AS created_this_month
    FROM documents
    WHERE deleted_at IS NULL
  `);

  const totals = totalsQuery[0] || {
    total_docs: 0,
    ocr_completed: 0,
    ocr_pending: 0,
    created_this_month: 0,
  };

  // 2. Documentos por Año (últimos 6 años)
  const byYearQuery = await db.execute(sql`
    SELECT 
      coalesce(year::text, 'S/D') AS label,
      year AS year_num,
      COUNT(*)::int AS count
    FROM documents
    WHERE deleted_at IS NULL
    GROUP BY year
    ORDER BY year DESC NULLS LAST
    LIMIT 6
  `);

  // 3. Documentos por Tipo
  const byTypeQuery = await db.execute(sql`
    SELECT 
      dt.id AS id,
      dt.name AS label,
      dt.code AS code,
      COUNT(d.id)::int AS count
    FROM document_types dt
    LEFT JOIN documents d ON d.type_id = dt.id AND d.deleted_at IS NULL
    GROUP BY dt.id, dt.name, dt.code
    ORDER BY count DESC
    LIMIT 8
  `);

  // 4. Documentos por Origen
  const byOriginQuery = await db.execute(sql`
    SELECT 
      orig.id AS id,
      coalesce(orig.code, 'S/O') AS label,
      orig.name AS name,
      COUNT(d.id)::int AS count
    FROM origins orig
    LEFT JOIN documents d ON d.origin_id = orig.id AND d.deleted_at IS NULL
    GROUP BY orig.id, orig.code, orig.name
    ORDER BY count DESC
    LIMIT 8
  `);

  return {
    totals,
    byYear: byYearQuery,
    byType: byTypeQuery,
    byOrigin: byOriginQuery,
  };
}
