import type { APIRoute } from 'astro';
import { checkDuplicate } from '../../../server/services/documents';

export const GET: APIRoute = async ({ url }) => {
  const typeId = Number(url.searchParams.get('typeId'));
  const originId = url.searchParams.get('originId') ? Number(url.searchParams.get('originId')) : null;
  const number = url.searchParams.get('number');
  const year = url.searchParams.get('year') ? Number(url.searchParams.get('year')) : null;
  const excludeId = url.searchParams.get('excludeId') || undefined;

  if (!typeId) {
    return new Response(JSON.stringify({ isDuplicate: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isDup = await checkDuplicate(typeId, originId, number, year, excludeId);

  return new Response(JSON.stringify({ isDuplicate: isDup }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
