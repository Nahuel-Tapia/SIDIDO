import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export interface SearchFilters {
  q?: string;           // Búsqueda de texto libre general (también busca por Expediente, DNI sin puntos o nombres asociados)
  typeId?: number;
  originId?: number;
  number?: string;
  year?: number;
  expediente?: string;  // Filtro directo por Número de Expediente (ej: 300-028554-2026)
  dni?: string;         // Filtro directo por DNI / CUIL
  persona?: string;     // Filtro directo por Nombre Asociado
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

  if (filters.expediente?.trim()) {
    const expClean = `%${filters.expediente.trim()}%`;
    const expDigits = filters.expediente.replace(/\D/g, '');
    if (expDigits.length >= 6) {
      const expDigitsLike = `%${expDigits}%`;
      whereConditions.push(
        sql`(
          coalesce(d.expediente, '') ILIKE ${expClean}
          OR coalesce(d.extracted_metadata->>'expediente', '') ILIKE ${expClean}
          OR regexp_replace(coalesce(d.expediente, ''), '[^0-9]', '', 'g') LIKE ${expDigitsLike}
        )`
      );
    } else {
      whereConditions.push(
        sql`(
          coalesce(d.expediente, '') ILIKE ${expClean}
          OR coalesce(d.extracted_metadata->>'expediente', '') ILIKE ${expClean}
        )`
      );
    }
  }

  if (filters.dni?.trim()) {
    const rawDigits = filters.dni.replace(/\D/g, '');
    const rawLike = `%${filters.dni.trim()}%`;
    if (rawDigits.length >= 5) {
      const digitsLike = `%${rawDigits}%`;
      whereConditions.push(
        sql`(
          coalesce(d.extracted_metadata::text, '') ILIKE ${rawLike}
          OR regexp_replace(coalesce(d.extracted_metadata::text, '') || ' ' || coalesce(d.contenido, ''), '[^0-9]', '', 'g') LIKE ${digitsLike}
        )`
      );
    } else {
      whereConditions.push(sql`coalesce(d.extracted_metadata::text, '') ILIKE ${rawLike}`);
    }
  }

  if (filters.persona?.trim()) {
    const perClean = `%${filters.persona.trim()}%`;
    whereConditions.push(
      sql`(
        coalesce(d.extracted_metadata::text, '') ILIKE ${perClean}
        OR coalesce(d.caratula, '') ILIKE ${perClean}
        OR coalesce(d.contenido, '') ILIKE ${perClean}
      )`
    );
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

  if (filters.q?.trim()) {
    hasFtsQuery = true;
    const cleanQ = filters.q.trim();
    const digitsOnly = cleanQ.replace(/\D/g, '');
    const ilikeQ = `%${cleanQ}%`;

    if (digitsOnly.length >= 6) {
      const digitsLike = `%${digitsOnly}%`;
      whereConditions.push(
        sql`(
          d.search_vector @@ websearch_to_tsquery('es_unaccent', ${cleanQ})
          OR coalesce(d.expediente, '') ILIKE ${ilikeQ}
          OR coalesce(d.extracted_metadata::text, '') ILIKE ${ilikeQ}
          OR regexp_replace(coalesce(d.expediente, '') || ' ' || coalesce(d.extracted_metadata::text, '') || ' ' || coalesce(d.contenido, ''), '[^0-9]', '', 'g') LIKE ${digitsLike}
        )`
      );
    } else {
      whereConditions.push(
        sql`(
          d.search_vector @@ websearch_to_tsquery('es_unaccent', ${cleanQ})
          OR coalesce(d.expediente, '') ILIKE ${ilikeQ}
          OR coalesce(d.extracted_metadata::text, '') ILIKE ${ilikeQ}
          OR coalesce(d.number, '') ILIKE ${ilikeQ}
        )`
      );
    }
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
  const cleanQ = filters.q?.trim() || '';
  const hasAlphanumeric = /[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/.test(cleanQ);

  const headlineSql = (hasFtsQuery && hasAlphanumeric)
    ? sql`CASE 
        WHEN websearch_to_tsquery('es_unaccent', ${cleanQ})::text != '' 
        THEN ts_headline('es_unaccent', coalesce(d.extracto, d.caratula, ''), websearch_to_tsquery('es_unaccent', ${cleanQ}), 'StartSel = <mark>, StopSel = </mark>, MaxWords = 35, MinWords = 15')
        ELSE coalesce(d.extracto, d.caratula, '')
      END AS headline`
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
      d.expediente,
      d.caratula,
      d.extracto,
      d.file_key,
      d.file_name,
      d.file_size,
      d.ocr_status,
      d.extracted_metadata,
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
