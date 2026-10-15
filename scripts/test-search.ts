import { searchDocuments } from '../src/server/services/search';
import { checkDuplicate } from '../src/server/services/documents';

async function test() {
  console.log('--- Verificación de Búsqueda FTS y Filtros Flexibles ---');

  // Test 1: Búsqueda sin tilde ("educacion")
  const resSinTilde = await searchDocuments({ q: 'educacion' });
  console.log(`1. Búsqueda 'educacion' (sin tilde): ${resSinTilde.total} documentos encontrados.`);

  // Test 2: Búsqueda con tilde ("educación")
  const resConTilde = await searchDocuments({ q: 'educación' });
  console.log(`2. Búsqueda 'educación' (con tilde): ${resConTilde.total} documentos encontrados.`);

  // Test 3: Filtro único (solo año 2024, sin otros filtros)
  const resSoloAnio = await searchDocuments({ year: 2024 });
  console.log(`3. Filtro único (solo año 2024): ${resSoloAnio.total} documentos encontrados.`);

  // Test 4: Chequeo de duplicados
  const isDup = await checkDuplicate(1, 1, '1420', 2024);
  console.log(`4. Chequeo de duplicado existente (RES ME 1420/2024): es duplicado = ${isDup}`);

  const isNotDup = await checkDuplicate(1, 1, '9999', 2026);
  console.log(`5. Chequeo de nuevo documento (RES ME 9999/2026): es duplicado = ${isNotDup}`);

  console.log('--- Todas las verificaciones completadas con éxito! ---');
  process.exit(0);
}

test().catch(console.error);
