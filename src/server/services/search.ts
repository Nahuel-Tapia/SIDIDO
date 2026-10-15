import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export interface SearchFilters {
  q?: string;           // Búsqueda de texto libre general
  typeId?: number;
  originId?: number;
  number?: string;
  year?: number;
  caratula?: string;
  extracto?: string;
  contenido?: string;
  orderBy?: 'relevance' | 'date_desc' | 'date_asc' | 'year_desc' | 'number_asc';
  page?: number;
  pageSize?: number;
}

export async function searchDocuments(filters: SearchFilters) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 15));
  const offset = (page - 1) * pageSize;

  const whereConditions: any[] = [
    sql`d.deleted_at IS NULL`
  ];

  if (filters.typeId) {
    whereConditions.push(sql`d.type_id = ${filters.typeId}`);
  }

  if (filters.originId) {
    whereConditions.push(sql`d.origin_id = ${filters.originId}`);
  }

  if (filters.year) {
    whereConditions.push(sql`d.year = ${filters.year}`);
  }

  if (filters.number?.trim()) {
    const numClean = `%${filters.number.trim().toLowerCase()}%`;
    whereConditions.push(sql`lower(d.number) LIKE ${numClean}`);
  }

  if (filters.caratula?.trim()) {
    const carClean = `%${filters.caratula.trim()}%`;
    whereConditions.push(sql`d.caratula ILIKE ${carClean}`);
  }

  if (filters.extracto?.trim()) {
    const extClean = `%${filters.extracto.trim()}%`;
    whereConditions.push(sql`d.extracto ILIKE ${extClean}`);
  }

  if (filters.contenido?.trim()) {
    const contClean = `%${filters.contenido.trim()}%`;
    whereConditions.push(sql`d.contenido ILIKE ${contClean}`);
  }

  let hasFtsQuery = false;
  let ftsCondition: any = null;

  if (filters.q?.trim()) {
    hasFtsQuery = true;
    const cleanQ = filters.q.trim();
    ftsCondition = sql`d.search_vector @@ websearch_to_tsquery('es_unaccent', ${cleanQ})`;
    whereConditions.push(ftsCondition);
  }

  const whereClause = sql.join(whereConditions, sql` AND `);

  // Ordenamiento
  let orderSql = sql`d.created_at DESC`;
  if (hasFtsQuery && filters.orderBy === 'relevance') {
    const cleanQ = filters.q!.trim();
    orderSql = sql`ts_rank_cd(d.search_vector, websearch_to_tsquery('es_unaccent', ${cleanQ})) DESC, d.year DESC NULLS LAST, d.created_at DESC`;
  } else if (filters.orderBy === 'date_asc') {
    orderSql = sql`d.created_at ASC`;
  } else if (filters.orderBy === 'year_desc') {
    orderSql = sql`d.year DESC NULLS LAST, d.number ASC NULLS LAST`;
  } else if (filters.orderBy === 'number_asc') {
    orderSql = sql`d.number ASC NULLS LAST`;
  } else {
    orderSql = sql`d.created_at DESC`;
  }

  // Fragmento de titular (headline / highlight) si hay búsqueda de texto
  const headlineSql = hasFtsQuery
    ? sql`ts_headline('es_unaccent', coalesce(d.extracto, d.caratula, ''), websearch_to_tsquery('es_unaccent', ${filters.q!.trim()}), 'StartSel = <mark>, StopSel = </mark>, MaxWords = 35, MinWords = 15') AS headline`
    : sql`coalesce(d.extracto, d.caratula, '') AS headline`;

  // Consulta de conteo total
  const countQuery = sql`
    SELECT COUNT(*)::int AS total
    FROM documents d
    WHERE ${whereClause}
  `;
  const countResult = await db.execute(countQuery);
  const total = (countResult[0]?.total as number) || 0;

  // Consulta paginada con joins
  const query = sql`
    SELECT 
      d.id,
      d.number,
      d.year,
      d.caratula,
      d.extracto,
      d.file_key,
      d.file_name,
      d.file_size,
      d.ocr_status,
      d.created_at,
      dt.name AS type_name,
      dt.code AS type_code,
      orig.name AS origin_name,
      orig.code AS origin_code,
      ${headlineSql}
    FROM documents d
    INNER JOIN document_types dt ON d.type_id = dt.id
    LEFT JOIN origins orig ON d.origin_id = orig.id
    WHERE ${whereClause}
    ORDER BY ${orderSql}
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const results = await db.execute(query);

  return {
    items: results,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
